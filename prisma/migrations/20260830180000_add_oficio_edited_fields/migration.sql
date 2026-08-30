-- Expand: marca campos do cabeçalho corrigidos à mão.
-- Contract: coluna nova com default vazio; leitura antiga permanece.

ALTER TABLE "ImpcgAuthorization" ADD COLUMN "editedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CassemsAuthorization" ADD COLUMN "editedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
