type Props = {
  patientName: string;
  hospitalName: string | null;
};

/** Paciente + local empilhados — tabela e card compacto das páginas de Gestão. */
export default function GestaoPatientHospital({ patientName, hospitalName }: Props) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
        {patientName}
      </p>
      <p className="text-xs font-normal text-slate-500 dark:text-slate-400 truncate mt-0.5">
        {hospitalName || '—'}
      </p>
    </div>
  );
}
