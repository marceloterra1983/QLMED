# Gates: S1 — Spike: emissão automática das certidões nos órgãos (sem código no app)

Scope: responder, por órgão, "dá para emitir sem humano?" com prova, em ≤ 2 h por órgão. Saída: specs/042-cadastro-documentos-certidoes/SPIKE-emissao.md. Nada entra em src/.

- [ ] G1: matriz preenchida para os 5 emissores: Receita Federal (CND conjunta PGFN/RFB), Caixa (CRF FGTS), TST (CNDT), SEFAZ-MS (CND estadual), Prefeitura de Campo Grande (mobiliário e débitos gerais). Colunas: URL de emissão; exige captcha? (qual); exige login gov.br/certificado?; existe API oficial (ex.: SERPRO Integra Contador / Consulta CND, paga)?; formato de saída; validade; veredito: automatizável | só com API paga | só humano
  EVIDENCE: pending

- [ ] G2: cada célula "captcha"/"login" tem prova: screenshot da página real no dia do spike em evidence/S1-<orgao>.png
  EVIDENCE: pending

- [ ] G3: para cada emissor com veredito "automatizável" há um script descartável fora do repo (scratchpad) que baixou a certidão real uma vez, com hash do PDF anotado
  EVIDENCE: pending

- [ ] G4: recomendação final em uma página: o que implementar (se algo), custo mensal se API paga, e o que fica humano. Sem captcha-solving de terceiros, sem contornar bot-detection — se o órgão bloqueia automação, o veredito é "humano" e ponto
  EVIDENCE: pending
