# Graph Report - /home/marce/qlmed/app-dev  (2026-07-23)

## Corpus Check
- Large corpus: 549 files · ~388,917 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 2570 nodes · 6357 edges · 199 communities (117 shown, 82 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.64)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Geração de PDF DACTE/DANFE
- Rotas API: ANVISA e Auth
- Sync XML OneDrive/Local
- Export XML e Certificados
- UI Detalhes de Contato
- Importação de Produtos ANVISA
- Rotas API de Escrita (POST/PUT)
- Backfill de Impostos e Entrada de Estoque
- Agregação do Dashboard
- Páginas do Painel (Cadastro/Fiscal)
- Admin, API Keys e Access Log
- Consulta de Notas e Parsing CT-e
- UI Cadastro de Produtos (React)
- Cliente NSDocs
- CFOP e Classificação Fiscal
- Scripts de Matching e Relatórios
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 108
- Community 109
- Community 110
- Community 111
- Community 112
- Community 113
- Community 114
- Community 115
- Community 116
- Community 117
- Community 118
- Community 119
- Community 120
- Community 121
- Community 122
- Community 123
- Community 124
- Community 125
- Community 126
- Community 127
- Community 128
- Community 129
- Community 130
- Community 131
- Community 132
- Community 133
- Community 134
- Community 135
- Community 136
- Community 137
- Community 138
- Community 139
- Community 140
- Community 141
- Community 142
- Community 143
- Community 144
- Community 145
- Community 146
- Community 147
- Community 148
- Community 149
- Community 150
- Community 151
- Community 152
- Community 153
- Community 154
- Community 155
- Community 156
- Community 157
- Community 158
- Community 159
- Community 160
- Community 161
- Community 162
- Community 163
- Community 164
- Community 165
- Community 166
- Community 167
- Community 168
- Community 169
- Community 170
- Community 171
- Community 172
- Community 173
- Community 174
- Community 175
- Community 176
- Community 177
- Community 178
- Community 179
- Community 180
- Community 181
- Community 190
- Community 191

## God Nodes (most connected - your core abstractions)
1. `unauthorizedResponse()` - 186 edges
2. `getOrCreateSingleCompany()` - 143 edges
3. `apiError()` - 128 edges
4. `requireAuth()` - 104 edges
5. `forbiddenResponse()` - 102 edges
6. `prisma` - 99 edges
7. `apiValidationError()` - 82 edges
8. `createLogger()` - 75 edges
9. `requireEditor()` - 57 edges
10. `formatAmount()` - 43 edges

## Surprising Connections (you probably didn't know these)
- `parseCteDetails()` --indirect_call--> `q()`  [INFERRED]
  src/app/api/invoices/[id]/details/route.ts → scripts/sync-anvisa-opendata.js
- `POST()` --references--> `jszip`  [EXTRACTED]
  src/app/api/invoices/bulk-download/route.ts → package.json
- `SettingsModal()` --indirect_call--> `q()`  [INFERRED]
  src/app/(painel)/cadastro/produtos/SettingsModal.tsx → scripts/sync-anvisa-opendata.js
- `acquirePostgresAdvisoryLock()` --references--> `{ Client }`  [EXTRACTED]
  src/lib/postgres-advisory-lock.ts → scripts/verify-production-migration-window.cjs
- `highlightMatch()` --references--> `react`  [EXTRACTED]
  src/app/(painel)/cadastro/produtos/components/product-utils.ts → package.json

## Import Cycles
- None detected.

## Communities (199 total, 82 thin omitted)

### Community 0 - "Geração de PDF DACTE/DANFE"
Cohesion: 0.08
Nodes (72): GET(), log, buildCteDataFromInvoice(), buildCteHtml(), cteUnidadeLabel(), emptyCtePartyData(), extractCteData(), fmtCteModelo() (+64 more)

### Community 1 - "Rotas API: ANVISA e Auth"
Cohesion: 0.06
Nodes (54): AnvisaSourceKey, GET(), isBlockedByHeaders(), PROBE_URLS, log, POST(), DELETE(), GET() (+46 more)

### Community 2 - "Sync XML OneDrive/Local"
Cohesion: 0.06
Nodes (70): collectAllXmlFiles(), copyXmlFileIfNeeded(), directoryExists(), drainImportQueue(), enqueueImport(), findFilesMissingInDatabase(), getMostRecentMonthFolders(), getNewestMonthFolder() (+62 more)

### Community 3 - "Export XML e Certificados"
Cohesion: 0.05
Nodes (59): POST(), VALID_DIRECTIONS, VALID_TYPES, getOriginalIssuedPdf(), isSupportedIssuedNfe(), normalizeOneDrivePath(), ONEDRIVE_ISSUED_PDF_ROOT_PATH, oneDriveGraphDownloadFile() (+51 more)

### Community 4 - "UI Detalhes de Contato"
Cohesion: 0.08
Nodes (57): AddressSection(), AddressSectionProps, AddressDivergence, ContactDetails, ContactDuplicate, ContactFiscalData, ContactInvoice, ContactMeta (+49 more)

### Community 5 - "Importação de Produtos ANVISA"
Cohesion: 0.06
Nodes (59): GET(), log, buildProductKey(), log, normalizeToken(), normalizeUnit(), POST(), UNIT_ALIASES (+51 more)

### Community 6 - "Rotas API de Escrita (POST/PUT)"
Cohesion: 0.09
Nodes (55): POST(), POST(), PUT(), PUT(), cteManifestSchema, log, POST(), DELETE() (+47 more)

### Community 7 - "Backfill de Impostos e Entrada de Estoque"
Cohesion: 0.06
Nodes (59): ensureTables(), main(), prisma, upsertItems(), upsertTotals(), GET(), log, noBodySchema (+51 more)

### Community 8 - "Agregação do Dashboard"
Cohesion: 0.08
Nodes (47): endOfMonth(), endOfQuarter(), endOfYear(), formatPeriodLabel(), GET(), log, startOfMonth(), startOfQuarter() (+39 more)

### Community 9 - "Páginas do Painel (Cadastro/Fiscal)"
Cohesion: 0.09
Nodes (42): formatDocument(), Supplier, SupplierDetailsModal, SupplierPriceTableModal, SuppliersPage(), CteDetailsModal, CtePage(), InvoiceDetailsModal (+34 more)

### Community 10 - "Admin, API Keys e Access Log"
Cohesion: 0.07
Nodes (36): GET(), POST(), DELETE(), createSchema, GET(), POST(), buildZipFilename(), BulkDownloadFormat (+28 more)

### Community 11 - "Consulta de Notas e Parsing CT-e"
Cohesion: 0.07
Nodes (47): decodeXmlEntities(), deleteInvoicesSchema, extractCteCnpjFromBlock(), extractCteRecebedorCnpj(), extractCteRecebedorName(), extractCteRemetenteCnpj(), extractCteRemetenteName(), extractNfseSenderCity() (+39 more)

### Community 12 - "UI Cadastro de Produtos (React)"
Cohesion: 0.12
Nodes (37): react, react, BulkEditModal(), BulkEditModalProps, BulkFieldRow(), DetailField(), DetailSectionCard(), ExportCSVButton() (+29 more)

### Community 13 - "Cliente NSDocs"
Cohesion: 0.08
Nodes (23): ConsultaResponse, log, NsdocsClient, NsdocsDocumento, NsdocsEmpresa, NsdocsPaginationError, NsdocsRequestOptions, NsdocsTransientError (+15 more)

### Community 14 - "CFOP e Classificação Fiscal"
Cohesion: 0.12
Nodes (38): CFOP_TAG_BY_CODE, CFOP_TAG_OPTIONS, extractFirstCfop(), isImportEntryCfop(), extractPartyFiscalData(), extractAndStoreContactFiscal(), log, mergeProductLines() (+30 more)

### Community 15 - "Scripts de Matching e Relatórios"
Cohesion: 0.09
Nodes (38): main(), normalizeCode(), stripNonAlnum(), p, abbreviateCompanyName(), CNPJ_MERGE_MAP, CustomerSale, CustomerYearEntry (+30 more)

### Community 16 - "Community 16"
Cohesion: 0.11
Nodes (31): clean(), hasGroup(), hasLine(), hasSubgroup(), POST(), syncCatalogAfterTypeChange(), clean(), DEFAULT_FISCAL_SEEDS (+23 more)

### Community 17 - "Community 17"
Cohesion: 0.08
Nodes (28): Customer, CustomerDetailsModal, CustomerPriceTableModal, CustomersPage(), formatDocument(), CustomerYearlySales, Product, ReportData (+20 more)

### Community 18 - "Community 18"
Cohesion: 0.06
Nodes (35): autoprefixer, eslint, eslint-config-next, @eslint/eslintrc, devDependencies, autoprefixer, eslint, eslint-config-next (+27 more)

### Community 19 - "Community 19"
Cohesion: 0.06
Nodes (35): bcryptjs, chokidar, effect, exceljs, fast-check, jszip, node-forge, nodemailer (+27 more)

### Community 20 - "Community 20"
Cohesion: 0.11
Nodes (24): log, GET(), maskToken(), POST(), PUT(), GET(), log, GET() (+16 more)

### Community 21 - "Community 21"
Cohesion: 0.13
Nodes (28): log, POST(), acknowledgeNotificationDeliveries(), buildDeliveryIdempotencyKey(), buildInvoiceNotificationDestinations(), buildNotificationEventKey(), canReceiveInvoiceNotifications(), claimNotificationDeliveries() (+20 more)

### Community 22 - "Community 22"
Cohesion: 0.09
Nodes (22): companyPostSchema, GET(), log, GET(), log, GET(), log, GET() (+14 more)

### Community 23 - "Community 23"
Cohesion: 0.07
Nodes (27): clean(), dbRows, extractModelKey(), fs, groupsByRow, hiConf, HIGH_CONF, loConf (+19 more)

### Community 24 - "Community 24"
Cohesion: 0.23
Nodes (24): DuplicataEditPanel(), DuplicataEditPanelProps, createEditRowId(), Duplicata, DuplicataEditForm, formatParcela(), formatVencimento(), getNextDupNumero() (+16 more)

### Community 25 - "Community 25"
Cohesion: 0.07
Nodes (26): dom, dom.iterable, esnext, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts, **/*.tsx (+18 more)

### Community 26 - "Community 26"
Cohesion: 0.15
Nodes (26): addField(), addReason(), APPLY, buildUpdate(), clean(), COMPANY_ARG_INDEX, countValues(), dice() (+18 more)

### Community 27 - "Community 27"
Cohesion: 0.10
Nodes (24): args, downloadCsv(), { execSync }, fs, https, main(), parseCsv(), path (+16 more)

### Community 28 - "Community 28"
Cohesion: 0.09
Nodes (23): CustomerDetails, CustomerDetailsResponse, CustomerMeta, CustomerPriceRow, CustomerPriceTableModal(), CustomerPriceTableModalProps, CustomerRef, fetchCustomerDetails() (+15 more)

### Community 29 - "Community 29"
Cohesion: 0.13
Nodes (25): AnvisaLookupInput, AnvisaLookupResult, AnvisaMatchMethod, buildCatalogIndex(), CatalogEntry, CatalogIndex, cleanCsvCell(), DATASET_URLS (+17 more)

### Community 30 - "Community 30"
Cohesion: 0.15
Nodes (24): BaseDuplicata, Company, ContasDuplicata, DIRECTION_CONFIG, DuplicataStatus, expandWithManualInstallments(), fetchBaseDuplicatas(), fetchOverrides() (+16 more)

### Community 31 - "Community 31"
Cohesion: 0.17
Nodes (22): CallbackPageProps, CallbackState, errorState(), OneDriveCallbackPage(), buildOneDriveAuthorizeUrl(), exchangeOneDriveCode(), getOneDriveAccountEmail(), getOneDriveDrive() (+14 more)

### Community 32 - "Community 32"
Cohesion: 0.12
Nodes (22): formatCnpjDisplay(), formatDateBr(), formatMoney(), NfeDetailsModal(), NfeDetailsModalProps, TabCobranca(), TabEmitDest(), TabNfe() (+14 more)

### Community 33 - "Community 33"
Cohesion: 0.10
Nodes (16): CertificateInfo, CertificateSectionProps, Company, Company, formatBytes(), IntegrationsSection(), IntegrationsSectionProps, NsdocsConfig (+8 more)

### Community 34 - "Community 34"
Cohesion: 0.09
Nodes (22): scripts, alias:install, build, check:deploy, db:generate, db:migrate:deploy, db:migrate:dev, db:migrate:verify (+14 more)

### Community 35 - "Community 35"
Cohesion: 0.09
Nodes (21): "AccessLog", "ApiKey", "cnpj_cache", "cnpj_monitoring", "contact_fiscal", "FinanceiroDuplicataManualInstallment", "FinanceiroDuplicataOverride", "Invoice" (+13 more)

### Community 36 - "Community 36"
Cohesion: 0.18
Nodes (21): GET(), log, parseCobranca(), parseCteDetails(), parseCteParty(), parseEmitDest(), parseInfAdicionais(), parseNfseDetails() (+13 more)

### Community 37 - "Community 37"
Cohesion: 0.13
Nodes (18): CnpjResult, fetchFromApi(), getFromDb(), getMemoryCache(), globalForCnpj, log, lookupCnpj(), saveToDb() (+10 more)

### Community 38 - "Community 38"
Cohesion: 0.21
Nodes (20): Path, ack(), build_delivery_link(), build_html(), build_text(), fetch_assets(), format_brl(), invoice_target_path() (+12 more)

### Community 39 - "Community 39"
Cohesion: 0.15
Nodes (18): scheduleNightlyRebuild(), checkAndSync(), getDatePartsInTimeZone(), getHourSlotKey(), getSefazCooldown(), hasElapsedInterval(), log, normalizeSyncIntervalMinutes() (+10 more)

### Community 40 - "Community 40"
Cohesion: 0.14
Nodes (18): CteDetailsModal(), CteDetailsModalProps, formatCnpjDisplay(), formatDateBr(), formatMoney(), TabCarga(), TabCte(), TabDocumentos() (+10 more)

### Community 41 - "Community 41"
Cohesion: 0.16
Nodes (9): parseXmlSafeNoMerge(), rejectDoctype(), safeXmlParser, safeXmlParserNoMerge, DistDFeResponse, gunzip, log, SefazClient (+1 more)

### Community 42 - "Community 42"
Cohesion: 0.16
Nodes (17): extractAccessKey(), extractCteTomador(), getPartyInfo(), hasPartyInfo(), parseCTe(), ParsedInvoice, parseInvoiceXml(), parseNFe() (+9 more)

### Community 43 - "Community 43"
Cohesion: 0.11
Nodes (18): NFeCobr, NFeDest, NFeDup, NFeEmit, NFeEndereco, NFeFat, NFeICMSTot, NFeIde (+10 more)

### Community 44 - "Community 44"
Cohesion: 0.11
Nodes (17): CTeDest, CTeEmit, CTeEndereco, CTeExped, CTeIde, CTeImp, CTeInfCarga, CTeInfCTeNorm (+9 more)

### Community 45 - "Community 45"
Cohesion: 0.12
Nodes (17): CteCarga, CteDocumentos, CteIcms, CteImpostos, CteInfAdicionais, CteInfo, CteSeguro, Fatura (+9 more)

### Community 46 - "Community 46"
Cohesion: 0.13
Nodes (12): clean(), dbRows, extractModelKey(), fs, norm(), rawRows, sheet, spByNorm (+4 more)

### Community 47 - "Community 47"
Cohesion: 0.18
Nodes (15): assert, dockerfile, fs, gate, { Client }, crypto, fail(), fs (+7 more)

### Community 48 - "Community 48"
Cohesion: 0.13
Nodes (5): get_feature_paths(), get_repo_root(), _persist_feature_json(), resolve_specify_init_dir(), common.sh script

### Community 49 - "Community 49"
Cohesion: 0.15
Nodes (14): buildEntryGroups(), buildYearMonths(), EntradaNfePage(), EntryHierarchy, hasPendency(), InvoiceEntry, InvoiceItem, LotEditModal (+6 more)

### Community 50 - "Community 50"
Cohesion: 0.12
Nodes (16): NFSeCompNfse, NFSeConsultarResposta, NFSeCpfCnpj, NFSeEnderecoAbrasf, NFSeIdentificacaoPrestador, NFSeIdentificacaoTomador, NFSeInfNfse, NFSeNacionalDPS (+8 more)

### Community 51 - "Community 51"
Cohesion: 0.17
Nodes (7): handler, firstBuildValue(), GET(), normalizeBuildValue(), authOptions, log, mocks

### Community 52 - "Community 52"
Cohesion: 0.17
Nodes (14): args, csv, { execSync }, extractSearchTerms(), fs, isNA(), main(), NA_DESC_KEYWORDS (+6 more)

### Community 53 - "Community 53"
Cohesion: 0.15
Nodes (12): adrIds, args, contents, errors, ids, markdownFiles, parseFrontmatter(), quiet (+4 more)

### Community 54 - "Community 54"
Cohesion: 0.19
Nodes (13): formatCnpjDisplay(), formatDateBr(), formatMoney(), NfseDetailsModal(), NfseDetailsModalProps, TabNfse(), TabParty(), TABS (+5 more)

### Community 55 - "Community 55"
Cohesion: 0.21
Nodes (12): UF_TO_CODE, getEmitterCnpjFromAccessKey(), InvoiceDirectionValue, normalizeDocument(), resolveInvoiceDirection(), getUfCode(), log, SEFAZ_QUERY_DELAY_MS (+4 more)

### Community 56 - "Community 56"
Cohesion: 0.23
Nodes (9): isDateKey(), log, normalizeOptionalText(), PATCH(), idParamSchema, installmentItemSchema, installmentsSchema, overrideSchema (+1 more)

### Community 57 - "Community 57"
Cohesion: 0.24
Nodes (13): buildHtml(), CustomerYear, esc(), fetchReportData(), fmtCurrency(), fmtCurrencyShort(), fmtNum(), generatePdf() (+5 more)

### Community 58 - "Community 58"
Cohesion: 0.16
Nodes (11): ROLE_COLORS, ROLE_LABELS, STATUS_COLORS, STATUS_LABELS, User, buildNavItems(), NavGroup, NavItem (+3 more)

### Community 59 - "Community 59"
Cohesion: 0.32
Nodes (11): GET(), log, redirectTo(), buildTrackedNotificationUrl(), getClientIp(), hashClickIp(), normalizePublicBaseUrl(), recordNotificationClick() (+3 more)

### Community 60 - "Community 60"
Cohesion: 0.26
Nodes (12): findXmlFiles(), fs, getNestedValue(), main(), parseCTeXml(), parseInvoiceXml(), parseNFeXml(), { parseString } (+4 more)

### Community 61 - "Community 61"
Cohesion: 0.18
Nodes (11): ErrorsPage(), formatDateTime(), Company, DashboardDocStats, DashboardStats, FinanceiroSummary, InvoiceDirection, InvoiceStatus (+3 more)

### Community 62 - "Community 62"
Cohesion: 0.24
Nodes (12): canAccessPage(), getRateLimitHeaders(), AUTH_COOKIE_NAMES, clearAuthCookies(), config, firstAllowedPage(), getRateLimitConfig(), isPublicApiRoute() (+4 more)

### Community 63 - "Community 63"
Cohesion: 0.17
Nodes (11): background_color, description, display, icons, lang, name, orientation, scope (+3 more)

### Community 64 - "Community 64"
Cohesion: 0.17
Nodes (11): args, data, emLinha, emLinhaEntries, { execSync }, fs, lines, rows (+3 more)

### Community 65 - "Community 65"
Cohesion: 0.21
Nodes (7): cellNum(), cellStr(), E509Row, log, POST(), log, mocks

### Community 66 - "Community 66"
Cohesion: 0.27
Nodes (11): backfillContactFiscalCity(), ContactFiscalDbRow, ContactFiscalRow, ensureContactFiscalTable(), getCityByCnpjs(), getContactFiscal(), getContactFiscalBatch(), globalForFiscal (+3 more)

### Community 67 - "Community 67"
Cohesion: 0.27
Nodes (11): AggregatedContact, buildContactKey(), buildYearCountMap(), compareStrings(), CONTACT_CONFIG, ContactType, handleContactList(), log (+3 more)

### Community 68 - "Community 68"
Cohesion: 0.36
Nodes (9): clean(), extractDescCode(), extractModelKey(), fs, main(), norm(), parseCSV(), tokenOverlap() (+1 more)

### Community 69 - "Community 69"
Cohesion: 0.29
Nodes (9): DESC_TYPE_HINTS, dice(), log, NCM_TYPE_MAP, norm(), POST(), Product, tokens() (+1 more)

### Community 70 - "Community 70"
Cohesion: 0.29
Nodes (9): Action, GET(), getApiKey(), getInternalBaseUrl(), log, n8nWebhookSchema, POST(), VALID_ACTIONS (+1 more)

### Community 71 - "Community 71"
Cohesion: 0.24
Nodes (9): CfopRow, DashboardTotals, FiscalDashboardPage(), formatCurrencyShort(), MONTH_NAMES, MonthlyRow, Period, StatCard() (+1 more)

### Community 72 - "Community 72"
Cohesion: 0.22
Nodes (8): name, overrides, @prisma/dev, sharp, uuid, @hono/node-server, private, version

### Community 73 - "Community 73"
Cohesion: 0.31
Nodes (8): args, { execSync }, fs, main(), sqlBool(), sqlNum(), sqlStr(), XLSX

### Community 74 - "Community 74"
Cohesion: 0.28
Nodes (5): manrope, metadata, viewport, Providers(), PWARegister()

### Community 75 - "Community 75"
Cohesion: 0.31
Nodes (4): AccessLogTracker(), DashboardLayoutClient(), useResizableSidebar(), UseResizableSidebarReturn

### Community 76 - "Community 76"
Cohesion: 0.33
Nodes (8): ABBREVIATIONS, AddressDivergence, AddressFields, compareAddresses(), expandAbbreviations(), fieldsMatch(), normalize(), normalizeCep()

### Community 77 - "Community 77"
Cohesion: 0.31
Nodes (7): ALL_PAGES, API_PREFIX_TO_PAGES, canAccessApi(), PAGE_GROUPS, PageDef, PageGroup, requiredPagesForApi()

### Community 78 - "Community 78"
Cohesion: 0.25
Nodes (7): cnpjSchema, companyIdSchema, dateRangeSchema, paginationSchema, schemas, searchSchema, createCompanySchema

### Community 79 - "Community 79"
Cohesion: 0.22
Nodes (9): CTeCompl, CTeICMS, CTeInfDoc, NFeInfAdic, NFePag, NFeTaxGroup, NFSePrestador, NFSeTomador (+1 more)

### Community 80 - "Community 80"
Cohesion: 0.29
Nodes (7): getMonthFolder(), main(), path, prisma, { PrismaClient }, TYPE_SUFFIX, XML_BACKUP_DIR

### Community 81 - "Community 81"
Cohesion: 0.25
Nodes (7): Company, initialMethodState, SyncLog, SyncMethod, SyncMethodState, SyncPage(), SyncState

### Community 82 - "Community 82"
Cohesion: 0.36
Nodes (7): DOC_THEME, escapeHtml(), formatAccessKey(), formatAndHighlightXml(), InvoiceDetailsModal(), InvoiceDetailsModalProps, InvoiceMeta

### Community 83 - "Community 83"
Cohesion: 0.25
Nodes (4): SidebarProps, ROLE_BADGE_COLORS, ROLE_LABELS, UserProfileProps

### Community 84 - "Community 84"
Cohesion: 0.43
Nodes (7): acquirePostgresAdvisoryLock(), createMissingProduct(), ProductAggregateRebuildResult, rebuildProductAggregatesForCompany(), updateExistingProduct(), AggregatedProduct, computeSearchText()

### Community 85 - "Community 85"
Cohesion: 0.48
Nodes (6): "CertificateConfig", "Company", "Invoice", "NsdocsConfig", "SyncLog", "User"

### Community 86 - "Community 86"
Cohesion: 0.29
Nodes (4): register(), log, optional, required

### Community 87 - "Community 87"
Cohesion: 0.33
Nodes (6): checkRateLimit(), cleanup(), RateLimitConfig, RateLimitEntry, RateLimitResult, store

### Community 88 - "Community 88"
Cohesion: 0.53
Nodes (4): commit_matches(), require_cmd(), check-deploy-alignment.sh script, usage()

### Community 89 - "Community 89"
Cohesion: 0.53
Nodes (4): commit_matches(), require_cmd(), publish-server.sh script, usage()

### Community 91 - "Community 91"
Cohesion: 0.40
Nodes (5): AnvisaPage(), AnvisaSourceKey, EmbedStatus, SOURCE_OPTIONS, SourceOption

### Community 92 - "Community 92"
Cohesion: 0.53
Nodes (5): analyzeAnvisaExpiration(), daysUntilExpiration(), ExpirationStatus, getExpirationStatus(), parseAnvisaExpiration()

### Community 93 - "Community 93"
Cohesion: 0.33
Nodes (4): FIXTURE_INVOICES, FixtureInvoice, mocks, PrismaFindManyArgs

### Community 94 - "Community 94"
Cohesion: 0.33
Nodes (5): JWT, next-auth, next-auth/jwt, Session, User

### Community 95 - "Community 95"
Cohesion: 0.40
Nodes (4): compat, __dirname, eslintConfig, __filename

### Community 96 - "Community 96"
Cohesion: 0.70
Nodes (4): commit_matches(), require_cmd(), deploy-server.sh script, usage()

### Community 100 - "Community 100"
Cohesion: 0.50
Nodes (4): checkCnaeProductMismatch(), CNAE_PRODUCT_MAP, CnaeMismatch, normalizeText()

### Community 101 - "Community 101"
Cohesion: 0.67
Nodes (3): extractFirstCfop(), main(), prisma

### Community 104 - "Community 104"
Cohesion: 0.83
Nodes (3): require_cmd(), rollback-server.sh script, usage()

### Community 105 - "Community 105"
Cohesion: 0.50
Nodes (3): { extractProductsFromXml, buildProductKey }, p, { PrismaClient }

### Community 106 - "Community 106"
Cohesion: 0.67
Nodes (3): CompaniesPage(), Company, formatCnpj()

### Community 107 - "Community 107"
Cohesion: 0.67
Nodes (3): invokePatch(), mocks, patchRequest()

## Knowledge Gaps
- **865 isolated node(s):** `{ chromium, devices }`, `check-prerequisites.sh script`, `common.sh script`, `create-new-feature.sh script`, `setup-plan.sh script` (+860 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **82 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Community 19` to `Community 160`, `Community 161`, `Community 162`, `Community 72`, `UI Cadastro de Produtos (React)`, `Community 156`, `Community 157`, `Community 158`, `Community 159`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Why does `prisma` connect `Admin, API Keys e Access Log` to `Geração de PDF DACTE/DANFE`, `Rotas API: ANVISA e Auth`, `Sync XML OneDrive/Local`, `Export XML e Certificados`, `Importação de Produtos ANVISA`, `Rotas API de Escrita (POST/PUT)`, `Backfill de Impostos e Entrada de Estoque`, `Agregação do Dashboard`, `Consulta de Notas e Parsing CT-e`, `Cliente NSDocs`, `CFOP e Classificação Fiscal`, `Scripts de Matching e Relatórios`, `Community 16`, `Community 20`, `Community 21`, `Community 22`, `Community 30`, `Community 31`, `Community 36`, `Community 37`, `Community 39`, `Community 51`, `Community 55`, `Community 56`, `Community 59`, `Community 65`, `Community 66`, `Community 67`, `Community 69`, `Community 84`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Why does `unauthorizedResponse()` connect `Rotas API: ANVISA e Auth` to `Geração de PDF DACTE/DANFE`, `Community 65`, `Export XML e Certificados`, `Community 36`, `Importação de Produtos ANVISA`, `Rotas API de Escrita (POST/PUT)`, `Backfill de Impostos e Entrada de Estoque`, `Agregação do Dashboard`, `Community 69`, `Admin, API Keys e Access Log`, `Consulta de Notas e Parsing CT-e`, `Scripts de Matching e Relatórios`, `Community 16`, `Community 20`, `Community 21`, `Community 22`, `Community 56`, `Community 57`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **What connects `{ chromium, devices }`, `check-prerequisites.sh script`, `common.sh script` to the rest of the system?**
  _865 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Geração de PDF DACTE/DANFE` be split into smaller, more focused modules?**
  _Cohesion score 0.08024691358024691 - nodes in this community are weakly interconnected._
- **Should `Rotas API: ANVISA e Auth` be split into smaller, more focused modules?**
  _Cohesion score 0.058941058941058944 - nodes in this community are weakly interconnected._
- **Should `Sync XML OneDrive/Local` be split into smaller, more focused modules?**
  _Cohesion score 0.06015037593984962 - nodes in this community are weakly interconnected._