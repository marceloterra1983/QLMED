'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';

interface UploadResult {
  success: string[];
  errors: string[];
}

export default function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  // Recursively read all files from a directory entry
  const readEntryRecursive = (entry: any): Promise<File[]> => {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((file: File) => {
          if (file.name.toLowerCase().endsWith('.xml')) resolve([file]);
          else resolve([]);
        });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const allEntries: any[] = [];
        const readBatch = () => {
          reader.readEntries((entries: any[]) => {
            if (entries.length === 0) {
              Promise.all(allEntries.map(readEntryRecursive)).then((results) => {
                resolve(results.flat());
              });
            } else {
              allEntries.push(...entries);
              readBatch();
            }
          });
        };
        readBatch();
      } else {
        resolve([]);
      }
    });
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const items = e.dataTransfer.items;
    if (items) {
      const entries = Array.from(items)
        .map((item) => (item as any).webkitGetAsEntry?.())
        .filter(Boolean);
      if (entries.length > 0) {
        const allFiles = await Promise.all(entries.map(readEntryRecursive));
        const xmlFiles = allFiles.flat();
        if (xmlFiles.length > 0) {
          setFiles((prev) => [...prev, ...xmlFiles]);
          return;
        }
      }
    }
    // Fallback for browsers that don't support webkitGetAsEntry
    const droppedFiles = Array.from(e.dataTransfer.files).filter((f) => f.name.toLowerCase().endsWith('.xml'));
    setFiles((prev) => [...prev, ...droppedFiles]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files).filter((f) => f.name.toLowerCase().endsWith('.xml'));
      setFiles((prev) => [...prev, ...selected]);
      // Reset so same selection can trigger onChange again
      e.target.value = '';
    }
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files).filter((f) => f.name.toLowerCase().endsWith('.xml'));
      setFiles((prev) => [...prev, ...selected]);
      e.target.value = '';
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));

      const res = await fetch('/api/invoices/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      setResult(data.results);
      if (data.results?.success?.length > 0) {
        toast.success(`${data.results.success.length} arquivo(s) importado(s) com sucesso!`);
        setFiles([]);
      }
      if (data.results?.errors?.length > 0) {
        toast.error(`${data.results.errors.length} erro(s) na importação`);
      }
    } catch {
      setResult({ success: [], errors: ['Erro ao fazer upload'] });
      toast.error('Erro ao fazer upload');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Importar XML</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1">
            Faça upload de arquivos XML de NF-e, CT-e ou NFS-e para importar notas fiscais.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Dropzone */}
          <div
            className={`bg-white dark:bg-card-dark border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${
              dragActive
                ? 'border-primary bg-primary/5'
                : 'border-slate-300 dark:border-slate-700 hover:border-primary/50'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <input
              ref={folderInputRef}
              type="file"
              className="hidden"
              onChange={handleFolderSelect}
              {...({ webkitdirectory: '', directory: '', multiple: true } as any)}
            />
            <span className={`material-symbols-outlined text-[64px] mb-4 transition-colors ${dragActive ? 'text-primary' : 'text-slate-300'}`}>
              cloud_upload
            </span>
            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2">
              Arraste e solte seus XMLs ou pastas aqui
            </h3>
            <p className="text-sm text-slate-400 mb-4">ou use os botões abaixo para selecionar</p>
            <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary/10 text-primary rounded-lg text-sm font-bold hover:bg-primary/20 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">description</span>
                Selecionar Arquivos
              </button>
              <button
                onClick={() => folderInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 text-amber-600 rounded-lg text-sm font-bold hover:bg-amber-500/20 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">folder_open</span>
                Selecionar Pasta
              </button>
            </div>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  {files.length} arquivo(s) selecionado(s)
                </h3>
                <button
                  onClick={() => setFiles([])}
                  className="text-xs font-medium text-slate-400 hover:text-red-500 transition-colors"
                >
                  Limpar todos
                </button>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                {files.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-[20px] text-primary">description</span>
                      <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{file.name}</p>
                        <p className="text-xs text-slate-400">
                          {(file.size / 1024).toFixed(1)} KB
                          {(file as any).webkitRelativePath && <span className="ml-2 text-slate-300">({(file as any).webkitRelativePath})</span>}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => removeFile(idx)} className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload Button */}
          <button
            onClick={handleUpload}
            disabled={files.length === 0 || uploading}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white rounded-xl text-lg font-bold transition-all shadow-lg shadow-primary/30 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {uploading ? (
              <>
                <span className="material-symbols-outlined text-[24px] animate-spin">progress_activity</span>
                Importando...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[24px]">cloud_upload</span>
                Importar {files.length} Arquivo(s)
              </>
            )}
          </button>
        </div>

        {/* Results Sidebar */}
        <div className="space-y-6">
          {/* Instructions */}
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4">Como importar</h3>
            <div className="space-y-4">
              <div className="flex gap-3">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex-shrink-0">1</span>
                <p className="text-sm text-slate-500">Selecione os arquivos XML (ou uma pasta)</p>
              </div>
              <div className="flex gap-3">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex-shrink-0">2</span>
                <p className="text-sm text-slate-500">Arraste para a área de upload ou use os botões</p>
              </div>
              <div className="flex gap-3">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex-shrink-0">3</span>
                <p className="text-sm text-slate-500">Clique em &quot;Importar&quot; e aguarde o processamento</p>
              </div>
            </div>
          </div>

          {/* Upload Results */}
          {result && (
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4">Resultado da Importação</h3>
              {result.success.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">
                    ✓ Importados ({result.success.length})
                  </p>
                  <div className="space-y-1">
                    {result.success.map((name, i) => (
                      <p key={i} className="text-sm text-slate-600 truncate">{name}</p>
                    ))}
                  </div>
                </div>
              )}
              {result.errors.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-2">
                    ✗ Erros ({result.errors.length})
                  </p>
                  <div className="space-y-1">
                    {result.errors.map((err, i) => (
                      <p key={i} className="text-sm text-red-500 truncate">{err}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
