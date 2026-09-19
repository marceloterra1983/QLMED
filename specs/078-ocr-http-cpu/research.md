# Research: SPEC-078

## OCR vs HTTP no mesmo processo

Amostra vps2 2026-09-19 ~16:36 BRT (KVM 8, steal ~0,3 %, health 15 ms):
`pdftoppm -r 300 -l 40` a 100 % CPU; `qlmed-app` a ~200 %; next-server ~11 %.
Amostra anterior: `tesseract .../impcg-ocr-*/page-1.png` a 249 % CPU.

Causa: OpenMP do Tesseract + raster 300 DPI, não o Postgres (cache hit ~91 %,
EXPLAIN Invoice já era ~92 ms).

## OMP_THREAD_LIMIT

Tesseract liga OpenMP. `OMP_THREAD_LIMIT=1` no env do filho limita a 1 thread
sem mudar `-l por` / `--oem 1`. Poppler pode honrar o mesmo.

## DPI

Área escala com r². 200/300 → ~44 % dos pixels de 300 DPI. Texto impresso em
português em 200 DPI é o compromisso; 150 fica para se a qualidade falhar em
produção.
