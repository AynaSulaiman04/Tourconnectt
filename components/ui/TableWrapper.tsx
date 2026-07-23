import type { ReactNode } from "react";

type TableWrapperProps = {
  children: ReactNode;
  className?: string;
};

export function TableWrapper({ children, className = "" }: TableWrapperProps) {
  return (
    <div className={`overflow-x-auto custom-scrollbar ${className}`.trim()}>
      <table className="table-shell">{children}</table>
    </div>
  );
}

