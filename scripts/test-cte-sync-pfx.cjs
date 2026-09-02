#!/usr/bin/env node
'use strict';
// O sync de CT-e lê pfxData directamente do banco, fora de src/. Este teste
// prova que o seu port do decryptPfx abre exactamente o que
// src/lib/certificate-secret.ts grava — e que DER cru ainda passa.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.ENCRYPTION_KEY = 'chave-de-teste-do-cte-sync-32chars!!';
const { decryptPfx, isEncryptedPfx, cnpjAad } = require('../ops/scripts/qlmed-cte-dist-sync.js');

function encryptLikeTheApp(pfx, cnpj) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', crypto.scryptSync(process.env.ENCRYPTION_KEY, salt, 32), iv);
  c.setAAD(cnpjAad(cnpj));
  const ct = Buffer.concat([c.update(pfx), c.final()]);
  return Buffer.concat([Buffer.from('QLMEDPFX1', 'ascii'), salt, iv, c.getAuthTag(), ct]);
}
const der = Buffer.concat([Buffer.from([0x30, 0x82, 0x23, 0xf1]), crypto.randomBytes(9201)]); // 9205 bytes, como o real
const blob = encryptLikeTheApp(der, '11.222.333/0001-81');
assert.ok(isEncryptedPfx(blob) && !isEncryptedPfx(der));
assert.ok(decryptPfx(blob, '11222333000181').equals(der), 'blob cifrado abre no DER original');
assert.ok(decryptPfx(der, '11222333000181').equals(der), 'DER cru continua a passar');
assert.throws(() => decryptPfx(blob, '99999999000191'), /Unsupported state|unable to authenticate/i, 'outro CNPJ não abre (AAD)');
assert.throws(() => decryptPfx(Buffer.from('lixo'), '11222333000181'), /nem cifrado.*nem DER/);
process.stdout.write('cte-sync pfx: 5 asserções ok\n');
