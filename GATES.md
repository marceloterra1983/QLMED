# Gates: Importação Oficial Spica (Motor + Carga)

Scope: Implementação do import-service, scripts auditáveis e execução da carga real de 7.965 produtos.

- [x] G1: Suíte de testes do import-service passa
  CHECK: ./node_modules/.bin/vitest run src/lib/__tests__/spica-import-service.test.ts src/lib/__tests__/spica-parse.test.ts src/lib/__tests__/product-codigo.test.ts
  EXPECT: /Test Files\s+3 passed/
  EVIDENCE: Test Files  3 passed (3)

- [x] G2: Banco de dados com 7.965 produtos oficiais do Spica gravados
  CHECK: python3 -c "import os, psycopg2; conn = psycopg2.connect(os.environ['DBURL']); cur = conn.cursor(); cur.execute('SELECT count(*) FROM product_registry WHERE codigo ~ \'^[0-9]{6}$\''); print(cur.fetchone()[0])" 2>/dev/null || node -e "const { Client } = require('pg'); const c = new Client({ connectionString: process.env.DATABASE_URL.replace('qlmed-db', '127.0.0.1') }); c.connect().then(() => c.query('SELECT count(*) FROM product_registry WHERE codigo ~ \'^[0-9]{6}$\'')).then(r => { console.log(r.rows[0].count); c.end(); });"
  EXPECT: 7965
  EVIDENCE: 7965

- [x] G3: Dados fiscais de 7.965 produtos preenchidos
  CHECK: node -e "const { Client } = require('pg'); const c = new Client({ connectionString: process.env.DATABASE_URL.replace('qlmed-db', '127.0.0.1') }); c.connect().then(() => c.query('SELECT count(*) FROM product_registry WHERE fiscal_sit_tributaria IS NOT NULL')).then(r => { console.log(r.rows[0].count); c.end(); });"
  EXPECT: 7965
  EVIDENCE: 7965
