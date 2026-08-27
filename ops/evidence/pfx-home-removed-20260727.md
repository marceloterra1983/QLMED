# Remoção PFX do home (2026-07-27)

- Arquivo: `~/qlmed/QL MED  MATERIAIS HOSPITALARES LTDA - senha 123456 (2).pfx`
- Problema: senha no filename + permissões 644 no home
- SHA-256: `892bd06066c3e2b5409d7d5bfe90ca36cf4e112e576b371240ff8272da80b968`
- Confirmado idêntico a `CertificateConfig.pfxData` (prod)
- Ação: `shred -u` — certificado continua só no banco (criptografado via pfxPassword)
