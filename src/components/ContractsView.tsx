import React, { useState, useMemo } from 'react';
import { ContractRecord, DrillingJob, User } from '../types';

interface ContractsViewProps {
  user?: User | null;
  contracts: ContractRecord[];
  jobs: DrillingJob[];
  onSaveContract: (contract: ContractRecord) => void;
}

export const ContractsView: React.FC<ContractsViewProps> = ({
  user,
  contracts,
  jobs,
  onSaveContract,
}) => {
  const [search, setSearch] = useState('');
  const [selectedContract, setSelectedContract] = useState<ContractRecord | null>(null);
  const [isNewContractOpen, setIsNewContractOpen] = useState(false);

  // New Contract Form
  const [contractNo, setContractNo] = useState('');
  const [name, setName] = useState('');
  const [client, setClient] = useState('ADNOC Onshore');
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState('2027-12-31');
  const [currency, setCurrency] = useState('USD');
  const [standbyDiscount, setStandbyDiscount] = useState(50);
  const [description, setDescription] = useState('');

  const filteredContracts = useMemo(() => {
    if (!search.trim()) return contracts;
    const q = search.toLowerCase();
    return contracts.filter((c) =>
      `${c.contractNo} ${c.name} ${c.client} ${c.currency}`.toLowerCase().includes(q)
    );
  }, [contracts, search]);

  const handleCreateContract = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractNo || !name) {
      alert('Please provide Contract Number and Name.');
      return;
    }

    const newC: ContractRecord = {
      id: `CTR-${Date.now()}`,
      contractNo: contractNo.trim(),
      name: name.trim(),
      client: client.trim(),
      startDate,
      endDate,
      status: 'Active',
      currency,
      standbyDiscountPct: Number(standbyDiscount) || 50,
      description: description.trim(),
    };

    onSaveContract(newC);
    setIsNewContractOpen(false);
    setContractNo('');
    setName('');
    setDescription('');
  };

  return (
    <div className="space-y-4">
      {/* Ribbon */}
      <div className="bg-white border border-[#b8c9db] rounded p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div>
          <div className="text-[11px] text-slate-500 font-medium">Commercial Agreements</div>
          <h1 className="text-base font-bold text-[#1a3055]">Master Service Contracts &amp; Price Books</h1>
        </div>
        {user?.role !== 'Viewer' && (
          <button
            onClick={() => setIsNewContractOpen(true)}
            className="px-3 py-1.5 rounded bg-[#1a3055] text-white font-bold text-xs hover:bg-[#24426d] shadow-sm transition cursor-pointer"
          >
            + New Contract
          </button>
        )}
      </div>

      {/* Search */}
      <div className="flex justify-end">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contract #, client, agreement..."
          className="bg-white border border-[#b8c9db] rounded px-3 py-1 text-xs w-64 outline-none font-medium focus:ring-1 focus:ring-amber-400"
        />
      </div>

      {/* Contracts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredContracts.map((c) => {
          const linkedJobs = jobs.filter(
            (j) => j.contract === c.name || j.client === c.client
          );

          return (
            <div
              key={c.id}
              className="bg-white border border-[#b8c9db] rounded overflow-hidden shadow-sm flex flex-col justify-between"
            >
              <div className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded">
                      {c.client}
                    </span>
                    <h3 className="text-sm font-bold text-[#1a3055] mt-1">{c.name}</h3>
                    <div className="text-xs font-mono text-slate-500">{c.contractNo}</div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      c.status === 'Active'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {c.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded border border-slate-200 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">Validity</span>
                    <span className="font-mono text-[11px]">
                      {c.startDate} ~ {c.endDate}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">Currency</span>
                    <span className="font-bold text-[#1a3055]">{c.currency}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">Standby Factor</span>
                    <span className="font-bold text-amber-800">{c.standbyDiscountPct}%</span>
                  </div>
                </div>

                {c.description && (
                  <div className="text-xs text-slate-600 italic">{c.description}</div>
                )}
              </div>

              <div className="px-4 py-2.5 bg-slate-50 border-t border-[#b8c9db] flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">
                  <strong>{linkedJobs.length}</strong> active job(s) linked
                </span>
                <button
                  onClick={() => setSelectedContract(c)}
                  className="text-blue-700 hover:underline font-bold cursor-pointer"
                >
                  View Details &rarr;
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* New Contract Modal */}
      {isNewContractOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsNewContractOpen(false);
          }}
        >
          <div className="bg-white rounded shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 bg-[#1a3055] text-white flex justify-between items-center">
              <h3 className="font-bold text-sm">Add Master Contract</h3>
              <button
                onClick={() => setIsNewContractOpen(false)}
                className="text-white/80 hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateContract} className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Contract Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CTR-ADNOC-2024-001"
                    value={contractNo}
                    onChange={(e) => setContractNo(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Client Entity *</label>
                  <select
                    value={client}
                    onChange={(e) => setClient(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 font-bold"
                  >
                    <option value="ADNOC Onshore">ADNOC Onshore</option>
                    <option value="ADNOC Drilling">ADNOC Drilling</option>
                    <option value="ADNOC Offshore">ADNOC Offshore</option>
                    <option value="Turnwell">Turnwell</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">Contract / Agreement Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ADNOC Onshore 3-Year Master Downhole Rental Agreement"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border rounded px-2.5 py-1.5"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold mb-1">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 font-mono font-bold"
                  >
                    <option value="USD">USD</option>
                    <option value="AED">AED</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">Standby Rate Percentage (%)</label>
                <input
                  type="number"
                  value={standbyDiscount}
                  onChange={(e) => setStandbyDiscount(Number(e.target.value))}
                  className="w-full border rounded px-2.5 py-1.5 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">Scope &amp; Description</label>
                <textarea
                  rows={2}
                  placeholder="General rental terms and conditions..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full border rounded px-2.5 py-1.5"
                />
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsNewContractOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-amber-400 text-[#1a3055] font-bold hover:bg-amber-500 shadow-sm cursor-pointer"
                >
                  Save Contract &rarr;
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Contract Detail Modal */}
      {selectedContract && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedContract(null);
          }}
        >
          <div className="bg-white rounded shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 bg-[#1a3055] text-white flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm">{selectedContract.name}</h3>
                <div className="text-[11px] text-slate-300 font-mono">{selectedContract.contractNo}</div>
              </div>
              <button
                onClick={() => setSelectedContract(null)}
                className="text-white/80 hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded border border-slate-200">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 block">Client:</span>
                  <span className="font-bold text-[#1a3055]">{selectedContract.client}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 block">Status:</span>
                  <span className="font-bold text-emerald-700">{selectedContract.status}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 block">Validity Period:</span>
                  <span className="font-mono">
                    {selectedContract.startDate} &rarr; {selectedContract.endDate}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 block">Billing Currency:</span>
                  <span className="font-bold">{selectedContract.currency}</span>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-700 mb-1">Contract Description</h4>
                <div className="p-2.5 bg-slate-50 border rounded text-slate-600">
                  {selectedContract.description || 'Standard downhole tool rental terms.'}
                </div>
              </div>
            </div>

            <div className="px-4 py-3 bg-slate-50 border-t border-[#b8c9db] flex justify-end">
              <button
                onClick={() => setSelectedContract(null)}
                className="px-3 py-1.5 rounded bg-[#1a3055] text-white font-bold hover:bg-[#24426d] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
