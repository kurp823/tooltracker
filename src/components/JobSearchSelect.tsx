import React, { useState, useRef, useEffect, useMemo } from 'react';
import { DrillingJob } from '../types';
import { Search, ChevronDown, Check, X, Briefcase } from 'lucide-react';

interface JobSearchSelectProps {
  jobs: DrillingJob[];
  selectedJobId: string;
  onSelectJob: (jobId: string) => void;
  className?: string;
  buttonClassName?: string;
  placeholder?: string;
  dropdownPosition?: 'left' | 'right';
}

export const JobSearchSelect: React.FC<JobSearchSelectProps> = ({
  jobs,
  selectedJobId,
  onSelectJob,
  className = '',
  buttonClassName = '',
  placeholder = 'Select Drilling Job...',
  dropdownPosition = 'left',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedJob = useMemo(() => {
    return jobs.find((j) => j && j.id === selectedJobId) || (selectedJobId ? null : jobs[0]);
  }, [jobs, selectedJobId]);

  // Filter jobs based on search term
  const filteredJobs = useMemo(() => {
    const list = jobs.filter((j) => j && j.id);
    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase();
    return list.filter((j) => {
      const idMatch = (j.id || '').toLowerCase().includes(term);
      const clientMatch = (j.client || '').toLowerCase().includes(term);
      const rigMatch = (j.rig || '').toLowerCase().includes(term);
      const wellMatch = (j.well || '').toLowerCase().includes(term);
      const poMatch = (j.poNumber || '').toLowerCase().includes(term);
      const statusMatch = (j.status || '').toLowerCase().includes(term);
      const contractMatch = (j.contractNo || (j as any).contract || '').toLowerCase().includes(term);
      const invMatch = (j.draftInvoiceNumber || j.legalInvoiceNumber || '').toLowerCase().includes(term);
      return idMatch || clientMatch || rigMatch || wellMatch || poMatch || statusMatch || contractMatch || invMatch;
    });
  }, [jobs, searchTerm]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation: Escape closes dropdown
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Focus input on open
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (jobId: string) => {
    onSelectJob(jobId);
    setIsOpen(false);
    setSearchTerm('');
  };

  const getStatusBadgeClass = (status: string) => {
    if (!status) return 'bg-slate-100 text-slate-700 border-slate-200';
    const s = status.toLowerCase();
    if (s.includes('draft')) return 'bg-amber-50 text-amber-900 border-amber-200';
    if (s.includes('final') || s.includes('closed') || s.includes('completed')) return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    if (s.includes('ongoing') || s.includes('active') || s.includes('drilling')) return 'bg-blue-50 text-blue-800 border-blue-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs flex items-center justify-between text-left transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
          buttonClassName || 'px-3 py-2 text-xs font-semibold'
        }`}
      >
        <div className="flex items-center space-x-2 truncate min-w-0">
          <Briefcase className="w-3.5 h-3.5 text-blue-700 shrink-0" />
          <div className="truncate flex items-center gap-1.5 text-xs">
            <span className="font-mono font-bold text-[#1a3055] shrink-0">
              {selectedJob ? selectedJob.id : placeholder}
            </span>
            {selectedJob && (
              <span className="text-slate-600 truncate">
                &bull; {selectedJob.client} &bull; Rig: <strong className="text-slate-800">{selectedJob.rig || 'N/A'}</strong> {selectedJob.well ? `| Well: ${selectedJob.well}` : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {selectedJob?.status && (
            <span className={`text-[9px] px-1.5 py-0.2 rounded border font-semibold truncate max-w-[90px] ${getStatusBadgeClass(selectedJob.status)}`}>
              {selectedJob.status}
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Searchable Dropdown Popover (Controlled height, never full-screen) */}
      {isOpen && (
        <div
          className={`absolute ${
            dropdownPosition === 'right' ? 'right-0' : 'left-0'
          } top-full mt-1 w-full min-w-[320px] max-w-[640px] bg-white rounded-lg shadow-2xl border border-slate-200 z-50 overflow-hidden flex flex-col`}
        >
          {/* Search Header */}
          <div className="p-2 border-b border-slate-200 bg-slate-50">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Type to search by Job #, Client, Rig, Well, PO..."
                className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-300 rounded text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-medium"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1 px-1">
              <span>{filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''} available</span>
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="text-blue-600 hover:underline font-medium cursor-pointer"
                >
                  Clear filter
                </button>
              )}
            </div>
          </div>

          {/* Job List Header */}
          <div className="bg-slate-100/90 border-b border-slate-200 px-3 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider grid grid-cols-12 gap-2">
            <span className="col-span-4">Job Number &amp; Status</span>
            <span className="col-span-4">Client</span>
            <span className="col-span-4 text-right">Rig / Well</span>
          </div>

          {/* Job List Rows (Scrollable, max 300px) */}
          <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100">
            {filteredJobs.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 italic">
                No matching jobs found for "{searchTerm}"
              </div>
            ) : (
              filteredJobs.map((job) => {
                const isSelected = job.id === selectedJobId;
                return (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => handleSelect(job.id)}
                    className={`w-full px-3 py-2 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/90 hover:bg-blue-100/80 text-blue-950 font-medium'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="grid grid-cols-12 gap-2 items-center text-xs">
                      {/* Job ID + Status */}
                      <div className="col-span-4 flex items-center gap-1.5 min-w-0">
                        <span className="font-mono font-bold text-xs text-[#1a3055] shrink-0">{job.id}</span>
                        <span className={`text-[9px] px-1 py-0.2 rounded border font-medium truncate ${getStatusBadgeClass(job.status)}`}>
                          {job.status}
                        </span>
                      </div>

                      {/* Client */}
                      <div className="col-span-4 text-xs text-slate-800 font-medium truncate" title={job.client}>
                        {job.client || '—'}
                      </div>

                      {/* Rig / Well & Checkmark */}
                      <div className="col-span-4 flex items-center justify-end gap-1.5 text-[11px] font-mono text-slate-600 truncate">
                        <span className="font-semibold text-slate-800">{job.rig || '—'}</span>
                        {job.well && job.well !== '—' && (
                          <span className="text-slate-500 font-normal">/ {job.well}</span>
                        )}
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-blue-600 shrink-0 ml-1" />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
