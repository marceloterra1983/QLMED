-- SPEC-042 L13: data de emissão lida do PDF (nullable). Nunca confundir com lastModifiedAt.

ALTER TABLE "CompanyDocument" ADD COLUMN "emitidoEm" DATE;
