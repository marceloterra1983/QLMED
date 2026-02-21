const NSDOCS_API_BASE = 'https://api.nsdocs.com.br/v2';

interface NsdocsRequestOptions {
  method?: string;
  body?: Record<string, string>;
  headers?: Record<string, string>;
}

interface ConsultaResponse {
  id_consulta: string;
  status_consulta: string;
}

interface RetornoConsulta {
  status: string;
  documentos?: NsdocsDocumento[];
  erro?: string;
}

interface NsdocsDocumento {
  id: string;
  chave_acesso: string;
  numero: string;
  serie: string;
  data_emissao: string;
  cnpj_emitente: string;
  nome_emitente: string;
  cnpj_destinatario: string;
  nome_destinatario: string;
  valor_total: number;
  situacao: string;
  tipo: string; // NFE, CTE, NFSE
}

interface NsdocsEmpresa {
  id: string;
  cnpj: string;
  razao_social: string;
}

export class NsdocsClient {
  private apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  private async request<T>(path: string, options: NsdocsRequestOptions = {}): Promise<T> {
    const { method = 'GET', body, headers = {} } = options;
    
    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        ...headers,
      },
    };

    if (body && method !== 'GET') {
      fetchOptions.body = new URLSearchParams(body).toString();
    }

    const response = await fetch(`${NSDOCS_API_BASE}${path}`, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`NSDocs API error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Testa a conexão com a API NSDocs listando as empresas
   */
  async testarConexao(): Promise<{ ok: boolean; empresas?: NsdocsEmpresa[]; error?: string }> {
    try {
      const empresas = await this.request<NsdocsEmpresa[]>('/empresas');
      return { ok: true, empresas };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  /**
   * Inicia consulta de documentos por CNPJ na SEFAZ (assíncrono)
   * Retorna um id_consulta para polling posterior
   */
  async consultarCnpj(cnpj: string): Promise<ConsultaResponse> {
    return this.request<ConsultaResponse>('/consultas/cnpj', {
      method: 'POST',
      body: { documento: cnpj.replace(/\D/g, '') },
    });
  }

  /**
   * Inicia consulta de documento por Chave de Acesso (44 dígitos)
   */
  async consultarChaveAcesso(chaveAcesso: string): Promise<ConsultaResponse> {
    return this.request<ConsultaResponse>('/consultas/dfe', {
      method: 'POST',
      body: { documento: chaveAcesso.replace(/\D/g, '') },
    });
  }

  /**
   * Verifica o resultado de uma consulta assíncrona
   * @param tipo - 'cnpj' ou 'dfe'
   * @param idConsulta - ID retornado pela consulta
   */
  async retornoConsulta(tipo: 'cnpj' | 'dfe', idConsulta: string): Promise<RetornoConsulta> {
    return this.request<RetornoConsulta>(`/consultas/${tipo}/${idConsulta}`);
  }

  /**
   * Lista documentos armazenados no NSDocs (página única)
   */
  async listarDocumentos(filtros?: Record<string, string>): Promise<NsdocsDocumento[]> {
    const params = filtros ? '?' + new URLSearchParams(filtros).toString() : '';
    return this.request<NsdocsDocumento[]>(`/documentos${params}`);
  }

  /**
   * Lista TODOS os documentos com paginação automática.
   * A API NSDocs usa 'quantidade' (limit) e 'deslocamento' (offset).
   */
  async listarTodosDocumentos(filtros?: Record<string, string>): Promise<NsdocsDocumento[]> {
    const allDocs: NsdocsDocumento[] = [];
    const pageSize = 100; // Tamanho máximo por página da API
    let deslocamento = 0;
    let hasMore = true;
    let safetyCounter = 0;
    const maxPages = 50; // Limite de segurança para evitar loops infinitos

    while (hasMore && safetyCounter < maxPages) {
      safetyCounter++;
      const paginatedFilters: Record<string, string> = {
        ...(filtros || {}),
        quantidade: String(pageSize),
        deslocamento: String(deslocamento),
      };

      const params = '?' + new URLSearchParams(paginatedFilters).toString();
      const docs = await this.request<NsdocsDocumento[]>(`/documentos${params}`);

      if (!docs || !Array.isArray(docs) || docs.length === 0) {
        hasMore = false;
      } else {
        allDocs.push(...docs);
        deslocamento += docs.length;
        // Se retornou menos que o pageSize, não há mais páginas
        if (docs.length < pageSize) {
          hasMore = false;
        }
      }
    }

    return allDocs;
  }

  /**
   * Recupera o XML de um documento
   */
  async recuperarXml(documentoId: string): Promise<string> {
    const response = await fetch(`${NSDOCS_API_BASE}/documentos/${documentoId}/xml`, {
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Accept': 'application/xml',
      },
    });

    if (!response.ok) {
      throw new Error(`NSDocs API error (${response.status}): ${await response.text()}`);
    }

    return response.text();
  }

  /**
   * Recupera o PDF (DANFE) de um documento
   */
  async recuperarPdf(documentoId: string): Promise<ArrayBuffer> {
    const response = await fetch(`${NSDOCS_API_BASE}/documentos/${documentoId}/pdf`, {
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Accept': 'application/pdf',
      },
    });

    if (!response.ok) {
      throw new Error(`NSDocs API error (${response.status}): ${await response.text()}`);
    }

    return response.arrayBuffer();
  }

  /**
   * Lista empresas cadastradas no NSDocs
   */
  async listarEmpresas(): Promise<NsdocsEmpresa[]> {
    return this.request<NsdocsEmpresa[]>('/empresas');
  }

  /**
   * Fluxo completo: consulta CNPJ e aguarda resultado (com polling)
   * Retorna os documentos encontrados
   */
  async syncCompleto(cnpj: string, maxTentativas = 30, intervaloMs = 2000): Promise<RetornoConsulta> {
    // 1. Inicia consulta
    const consulta = await this.consultarCnpj(cnpj);
    
    if (consulta.status_consulta !== 'Ok') {
      throw new Error(`Erro ao iniciar consulta: ${consulta.status_consulta}`);
    }

    // 2. Polling do resultado
    for (let i = 0; i < maxTentativas; i++) {
      await new Promise(resolve => setTimeout(resolve, intervaloMs));
      
      const retorno = await this.retornoConsulta('cnpj', consulta.id_consulta);
      
      if (retorno.status === 'Concluído' || retorno.status === 'Concluido') {
        return retorno;
      }

      if (retorno.status === 'Erro') {
        throw new Error(`Erro na consulta SEFAZ: ${retorno.erro || 'Erro desconhecido'}`);
      }

      // Status ainda "Processando" — continua polling
    }

    throw new Error('Timeout: consulta SEFAZ não foi concluída a tempo');
  }
}

export type { NsdocsDocumento, ConsultaResponse, RetornoConsulta, NsdocsEmpresa };
