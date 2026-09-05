---
id: SPIKE-042
status: draft
owner: QLMED
---

# SPIKE — Emissão automática de certidões (QLMED)

Investigação somente-leitura (04/09/2026) sobre os seis emissores das certidões que hoje
uma pessoa emite à mão e sobe ao OneDrive. Nada foi submetido, nenhum captcha foi resolvido,
nenhuma conta foi criada, nenhum código foi escrito em `src/`.

## 1. Quadro por emissor

| Certidão | URL de emissão | Captcha | Login/Certificado | API oficial | Validade | VEREDITO | Confiança |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RFB + PGFN — CND/CPEN conjunta federal | https://servicos.receitafederal.gov.br/servico/certidoes (grátis) · POST `https://gateway.apiserpro.serpro.gov.br/consulta-cnd-trial/v1/certidao` (pago) | hCaptcha validado server-side no canal grátis; **nenhum** na API SERPRO | Grátis: não. API SERPRO: e-CNPJ ICP-Brasil **uma vez** para assinar contrato; em runtime só OAuth2 (key/secret → bearer) | Sim — "Consulta CND" (SERPRO), paga: R$ 0,8788/req na 1ª faixa, sem franquia de consumo | 180 dias | **automatizável com API paga** | Alta |
| Caixa — CRF (FGTS) | https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf | Nenhum no formulário (HTML V-2.3 lido: zero ocorrências de "captcha") | Não | Não encontrada (seria raspagem do próprio portal; existe RPA de terceiro pago) | 30 dias (renovável a partir do 26º) | **automatizável sem custo** (com ressalva de bot management) | Média |
| TST — CNDT trabalhista | https://cndt-certidao.tst.jus.br/gerarCertidao | Captcha próprio do TST (imagem + áudio), `GET /api/captcha`, `tokenDesafio` + `resposta` obrigatórios no POST | Não | Não encontrada (o `/api/certidao` é endpoint interno do front e exige o captcha) | 180 dias | **somente-humano** | Alta |
| SEFAZ-MS — Certidão Tributária (PNDFIS) | https://servicos.efazenda.ms.gov.br/pndfis/Home/Emissao | Captcha de imagem proprietário (`/pndfis/Captcha/Show`, campo `CaptchaValue`) | Não | Não encontrada | 60 dias (PJ de direito privado) | **somente-humano** | Alta |
| Prefeitura de Campo Grande — CNDG / Mobiliária (SIAT) | https://siatportal.campogrande.ms.gov.br/servicos/cidadao/certidao (CNDG) · .../certidaoMobiliaria | Nenhum carregado pelas telas (HTML + 27 bundles JS lidos: zero "captcha"/"sitekey") | gov.br não, certificado não; login do portal **não confirmado** (Decreto 15.043/2022 previa cadastro no portal antigo) | Não encontrada (seria HTTP no fluxo Struts do portal) | 30 dias | **automatizável sem custo** | Média |
| SEFAZ-MT / PGE-MT — CND/CPEND conjunta | https://www.sefaz.mt.gov.br/cnd/certidao/servlet/ServletRotdAberto?origem=60 | Cloudflare Turnstile no formulário de emissão (`cf-turnstile-response`, `resetTurnstile()`); PGE documenta "informar o código da imagem" | Via pública: não. Via e-PAC: login/gov.br/certificado (fora do escopo) | Não encontrada | 60 dias | **somente-humano** | Alta |

## 2. Os "somente-humano": exatamente o que bloqueia

**TST — CNDT.** O bloqueio é **captcha**, não login. O formulário de emissão pede apenas CNPJ e o
desafio; não há gov.br, não há certificado A1/A3, não há mTLS em lugar nenhum da página nem do
`app.js`. O captcha é próprio do TST: um `GET https://cndt-certidao.tst.jus.br/api/captcha` devolve
`{token, imagem, audio}` e a emissão é um `POST /api/certidao` com `{cpfCnpj, tokenDesafio, resposta, email}`.
Sem o par `tokenDesafio`/`resposta` não há emissão, e a alternativa em áudio é acessibilidade, não
via programática. **Não há nada que o dono possa fornecer** (credencial, certificado, cadastro) que
destrave isto — só a pessoa lendo o desafio.

**SEFAZ-MS — PNDFIS.** O bloqueio é **captcha**, e só ele. Não há login, não há certificado, não há
cadastro, não há taxa: a página é 100% anônima. O `POST /pndfis/Home/Validar` exige
`tipoIdentificacao`, `numeroIdentificacao` e `CaptchaNumero` — o texto de uma imagem servida em
`/pndfis/Captcha/Show`. Sem alternativa oficial (nenhum áudio, nenhum modo autenticado que dispense).
O mesmo captcha aparece na tela de autenticidade, então nem a conferência é automatizável aqui.
Único humano necessário: ler 5-6 caracteres.

**SEFAZ-MT / PGE-MT.** O bloqueio é **anti-robô (Cloudflare Turnstile)** na via pública, não
credencial: o formulário pede só tipo de documento e número, e o serviço é gratuito. O HTML da
página de emissão carrega `https://challenges.cloudflare.com/turnstile/v0/api.js` e contém
`<input type="hidden" name="cf-turnstile-response">`, com `resetTurnstile()` chamada a cada falha;
a PGE-MT descreve o passo em linguagem de usuário como "Passo 4 - Informar o código da imagem".
Existe uma via alternativa **autenticada** (e-PAC da SEFAZ-MT, com login/senha, gov.br ou e-CNPJ),
mas ela troca o captcha por credencial e autenticar está fora do escopo deste spike — se o dono
quiser explorá-la, é decisão dele, e continua sem API documentada por trás. Ressalva honesta: não
consegui ver o widget renderizado no passo 1 do formulário, então não sei se o desafio aparece já
ali ou no passo seguinte; confirmar exigiria submeter.

## 3. O que dá para automatizar hoje

1. **Alerta de vencimento para as seis certidões** — validade é determinística a partir da data de
   emissão (180/30/180/60/30/60 dias). Zero dependência de órgão, zero custo. É a folha L7.
2. **Extração dos metadados no upload** — número, data/hora de emissão e código de autenticidade
   saem do PDF que a pessoa já sobe; deixa de ser digitação manual e alimenta o alerta.
3. **Validação por código, sem captcha, em três órgãos** (detalhe na secção 5): TST, SEFAZ-MT e
   Prefeitura de Campo Grande.
4. **Caixa — CRF, emissão completa sem custo**, se e somente se um teste manual assistido a partir
   do IP do servidor de produção mostrar que o POST de consulta **não** dispara desafio de robô
   (o site tem CDN Azion + cookies `__uzm*` de Radware Bot Manager). Se disparar, o veredito vira
   somente-humano e paramos. O certificado sai como HTML de impressão (`impressao.jsf`), não como
   PDF: a automação teria de fazer print-to-PDF. A Caixa só renova a partir do 26º dia, então o job
   só deve tentar emitir a 5 dias ou menos do vencimento.
5. **Campo Grande — CNDG/Mobiliária, emissão sem custo**, pendente de uma única confirmação: clicar
   "Emitir Certidão" uma vez e ver se conclui anónimo ou cai em login. Para a Mobiliária é preciso
   ter a Inscrição Municipal da QL MED em Campo Grande em config (a tela desabilita o campo CNPJ);
   confirmar antes se a empresa tem inscrição municipal lá ou se o documento em uso é só a CNDG.
6. **RFB/PGFN — emissão real e automática, pela API paga do SERPRO.** O consumo é irrisório para um
   CNPJ (2-3 chamadas/ano, ~R$ 3/ano). Antes de qualquer compromisso, rodar o **ambiente de
   demonstração gratuito** (swagger, CNPJs fictícios) e provar `Status 2 = Certidão Emitida` com
   `DocumentoPdf` em base64 — custo zero, sem contrato.

## 4. O que NÃO vamos fazer, e porquê

- **Não resolvemos nem contornamos captcha.** Nem por OCR, nem por serviço de terceiro que resolve
  desafio, nem por reprodução do fluxo de token. Onde o órgão exige captcha e não oferece
  alternativa oficial (TST, SEFAZ-MS, SEFAZ-MT, e o canal gratuito da RFB), o passo fica humano.
- **Não contornamos detecção de robô.** Nada de rotação de IP, fingerprint forjado ou automação
  disfarçada de browser humano para passar por Turnstile, Radware ou equivalente.
- **Não contratamos RPA de terceiro que atravessa o controlo anti-robô do órgão.** A Infosimples
  aparece nas fontes para SEFAZ-MS, SEFAZ-MT e Caixa e declara-se explicitamente automação sobre a
  página oficial; para os dois primeiros ela existe para contornar o captcha, e por isso está
  descartada — registada aqui só para o dono saber que existe e não a redescobrir como novidade.
- **Não criamos conta nem introduzimos credencial/certificado em portal nenhum** durante o spike.
  O e-CNPJ do SERPRO e o e-PAC da SEFAZ-MT são decisões do dono, não passos que executámos.
- **Não afirmamos o que não confirmámos.** Ficam explicitamente como *não confirmado*: o
  comportamento do POST de emissão em Campo Grande; se há captcha na tela de login do SIAT; o
  formato do documento da SEFAZ-MS; se existe taxa mínima mensal de faturamento no contrato SERPRO;
  se o verificador de autenticidade da RFB (`urlAutenticidade`) é utilizável por código (dá 302→404
  sem sessão do app); se o TST aceita uso automatizado do seu endpoint de validação.

## 5. Alternativa que funciona mesmo quando a emissão é humana

O problema real não é emitir — é **certidão vencer sem ninguém ver**. Isso resolve-se inteiro sem
tocar em captcha:

- **Lembrete/alerta no vencimento (já é a folha L7).** A validade é aritmética sobre a data de
  emissão. Alerta em D-30 para as de 180 dias, D-15 para as de 60, D-10 para as de 30 (a Caixa só
  renova a partir do 26º dia, então adiantar mais não ajuda).
- **Verificação de autenticidade por código, onde o órgão oferece endpoint sem captcha:**
  - **TST**: `POST https://cndt-certidao.tst.jus.br/api/certidao/validacao`, JSON
    `{cpfCnpj, numCertidao, anoCertidao}`, resposta `application/pdf`. Sem captcha, sem login.
    É endpoint interno do front-end, não API pública — sem contrato, sujeito a mudança; confirmar
    com o TST antes de depender dele.
  - **SEFAZ-MT**: `https://www.sefaz.mt.gov.br/cnd/certidao/servlet/ServletRotdAberto?origem=5`,
    POST com `numrCND`, `dataEmissao`, `codgAutentCND` (16 caracteres) e `ret=1`. O HTML dessa
    página não tem campo de captcha nem hidden do Turnstile.
  - **Campo Grande (SIAT)**: `.../dsf_cgr_gtm/por/validarcertidaoportalcon.do`, campos
    `numeroCertidao_Arg` e `codigoAutenticidade_Arg` (hex de 32 caracteres), ambos impressos no PDF.
    Sem captcha, sem login.
  - **RFB pela API paga**: a validação vem embutida — a resposta traz `CodigoControle`,
    `DataEmissao`, `DataValidade` e `TipoCertidao` direto da base da RFB.
  - **Sem endpoint utilizável**: SEFAZ-MS (a tela de autenticidade tem o mesmo captcha) e Caixa
    (a conferência é reconsultar o empregador no mesmo portal). Nestes, guardamos os metadados e
    exibimos; a conferência fica humana.
- **Duas armadilhas de modelo de dados**, para a tela não mentir: o resultado nem sempre é
  "negativa" — RFB e SEFAZ-MT devolvem CND *ou* CPEND/positiva-com-efeitos-de-negativa, e a SEFAZ-MS
  tem quatro desfechos possíveis; tratar como booleano "regular" produz tela falsa. E regularização
  de pendência leva até 72h para refletir (SEFAZ-MS), então reemitir logo após pagar dá falso negativo.

## 6. Recomendação

Implementar a folha L7 (alerta de vencimento) e a extração de número/data/código do PDF no upload:
resolve o problema real, custa só engenharia e não depende de nenhum órgão. Somar a validação por
código onde é grátis e sem captcha (TST, SEFAZ-MT, Campo Grande). Emissão automática: só a federal
compensa avaliar, e só depois do swagger de demonstração gratuito do SERPRO e de uma pergunta ao
comercial sobre taxa mínima mensal — o consumo é ~R$ 3/ano, o custo verdadeiro é o e-CNPJ e o contrato.
Caixa e Campo Grande ficam como "talvez", cada uma atrás de um teste manual de cinco minutos.
TST, SEFAZ-MS e SEFAZ-MT continuam humanas por captcha, e assim ficam.

## Fontes

RFB/SERPRO: `servicos.receitafederal.gov.br/servico/certidoes` (HTML, `/api/env` com sitekey
hCaptcha `4a65992d-…`, bundle `chunk-HRHJGXSL.js` com `ERRO_HCAPTCHA_EMITIR`), `loja.serpro.gov.br/consultacnd`
e `/ccstore/v1/products/consultacnd` (tabela de preços), `apicenter.estaleiro.serpro.gov.br/documentacao/consulta-cnd/`
(tipos retornados, quick start, como contratar, demonstração), ficha do serviço em gov.br.
Caixa: `consulta-crf.caixa.gov.br/consultacrf/pages/{consultaEmpregador,duvidasfrequentes,impressao}.jsf`,
`fgts.gov.br/Paginas/pesquisa-crf.aspx`, CRF real publicado em gov.br.
TST: `cndt-certidao.tst.jus.br/{,gerarCertidao,consultarCertidao,js/app.js}`, `tst.jus.br/o-que-e-cndt`,
Ato CGJT nº 1/2022 (juslaboris).
SEFAZ-MS: `servicos.efazenda.ms.gov.br/pndfis/Home/{Emissao,Autenticacao}`, catálogo e carta de
serviços da SEFAZ-MS, FAQ da PGE-MS.
Campo Grande: `siatportal.campogrande.ms.gov.br/{portal-servicos,servicos/cidadao/*}` e os iframes
`dsf_cgr_gtm/por/*.do`, comunicados da Prefeitura sobre o Decreto 15.043/2022 e a migração de 08/06/2026.
SEFAZ-MT: `sefaz.mt.gov.br/cnd/certidao/servlet/ServletRotdAberto?origem={60,5}`,
`www5.sefaz.mt.gov.br/-/6347016-emissao`, página de serviço da PGE-MT.
