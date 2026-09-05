# Gates: S1 — Spike: emissão automática das certidões nos órgãos (sem código no app)

Scope: responder, por órgão, "dá para emitir sem humano?" com prova, em ≤ 2 h por órgão. Saída: specs/042-cadastro-documentos-certidoes/SPIKE-emissao.md. Nada entra em src/.

- [x] G1: matriz preenchida para os 5 emissores: Receita Federal (CND conjunta PGFN/RFB), Caixa (CRF FGTS), TST (CNDT), SEFAZ-MS (CND estadual), Prefeitura de Campo Grande (mobiliário e débitos gerais). Colunas: URL de emissão; exige captcha? (qual); exige login gov.br/certificado?; existe API oficial (ex.: SERPRO Integra Contador / Consulta CND, paga)?; formato de saída; validade; veredito: automatizável | só com API paga | só humano
  EVIDENCE: specs/042-cadastro-documentos-certidoes/SPIKE-emissao.md (commit ce592fa). SEIS emissores (os 5 pedidos + SEFAZ-MT, que entrou porque o MT virou tipo próprio na L8). Vereditos: Municipal Campo Grande e FGTS "automatizável sem custo" (confiança média); Receita Federal "automatizável com API paga" (SERPRO Consulta CND, R$ 0,8788/req, ~R$ 3/ano para 1 CNPJ); CNDT (TST), Estadual MS e Estadual MT "somente humano" por captcha. Cada célula com URL de fonte.

- [ ] G2: cada célula "captcha"/"login" tem prova: screenshot da página real no dia do spike em evidence/S1-<orgao>.png
  EVIDENCE: ver ABANDON abaixo.

- [ ] G3: para cada emissor com veredito "automatizável" há um script descartável fora do repo (scratchpad) que baixou a certidão real uma vez, com hash do PDF anotado
  EVIDENCE: ver ABANDON abaixo.

- [x] G4: recomendação final em uma página: o que implementar (se algo), custo mensal se API paga, e o que fica humano. Sem captcha-solving de terceiros, sem contornar bot-detection — se o órgão bloqueia automação, o veredito é "humano" e ponto
  EVIDENCE: seção "Recomendação" do SPIKE-emissao.md: (1) fazer a L7 primeiro, que resolve o problema real sem depender de órgão; (2) verificação de autenticidade por código onde é grátis e sem captcha — TST, SEFAZ-MT e Campo Grande (adiada pelo dono, chip task_e239c963); (3) emissão automática só compensa na federal, e só depois do swagger de demonstração gratuito do SERPRO. Nenhum serviço de captcha-solving foi proposto; os três órgãos que exigem captcha ficaram "humano".

ABANDON: G2 nenhuma screenshot foi tirada. Os agentes leram o HTML de produção e o bundle JavaScript de cada órgão (via firecrawl), o que é prova MAIS forte que uma imagem: na Receita, por exemplo, foi lido o config de runtime `/api/env` com a `captchaPublicKey` do hCaptcha e os códigos de erro `ERRO_HCAPTCHA_EMITIR:106` e `CaptchaFalhaValidacao` dentro do bundle — isto prova validação server-side, coisa que uma screenshot não mostraria. As URLs de fonte estão no SPIKE-emissao.md e são reverificáveis.
ABANDON: G3 nenhum script baixou certidão real, e foi decisão deliberada, não falta de tempo: o brief do spike proibiu submeter formulário, criar conta e autenticar em sítio de órgão público. Provar a emissão exigiria exatamente isso. Para os dois vereditos "automatizável sem custo" (FGTS e Campo Grande) a confiança ficou registada como MÉDIA por causa desta lacuna, e o SPIKE-emissao.md diz que cada um precisa de um teste manual de 5 minutos antes de se investir engenharia.
