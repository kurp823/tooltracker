import React, { useState, useRef, useEffect, useMemo } from 'react';
import { DrillingJob } from '../types';
import { Search, ChevronDown, Check, X, Briefcase, MapPin, Hash } from 'lucide-react';

interface JobSearchSelectProps {
  jobs: DrillingJob[];
  selectedJobId: string;
  onSelectJob: (jobId: string) => void;
  className?: string;
}

export const JobSearchSelect: React.FC<JobSearchSelectProps> = ({
  jobs,
  selectedJobId,
  onSelectJob,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedJob = useMemo(() => {
    return jobs.find((j) => j.id === selectedJobId) || jobs[0];
  }, [jobs, selectedJobId]);

  // Filter jobs based on search term
  const filteredJobs = useMemo(() => {
    if (!searchTerm.trim()) return jobs;
    const term = searchTerm.toLowerCase();
    return jobs.filter((j) => {
      const idMatch = (j.id || '').toLowerCase().includes(term);
      const clientMatch = (j.client || '').toLowerCase().includes(term);
      const rigMatch = (j.rig || '').toLowerCase().includes(term);
      const wellMatch = (j.well || '').toLowerCase().includes(term);
      const poMatch = (j.poNumber || '').toLowerCase().includes(term);
      const statusMatch = (j.status || '').toLowerCase().includes(term);
      const invMatch = (j.draftInvoiceNumber || j.legalInvoiceNumber || '').toLowerCase().includes(term);
      return idMatch || clientMatch || rigMatch || wellMatch || poMatch || statusMatch || invMatch;
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
    if (status.includes('Draft')) return 'bg-amber-100 text-amber-900 border-amber-300';
    if (status.includes('Final') || status.includes('Closed')) return 'bg-emerald-100 text-emerald-900 border-emerald-300';
    if (status.includes('Ongoing')) return 'bg-blue-100 text-blue-900 border-blue-300';
    return 'bg-slate-100 text-slate-800 border-slate-300';
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full min-w-[280px] max-w-[360px] h-9 px-3 bg-white hover:bg-slate-50 border border-slate-300 rounded-md shadow-xs flex items-center justify-between text-left transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        <div className="flex items-center space-x-2 truncate">
          <Briefcase className="w-4 h-4 text-slate-500 shrink-0" />
          <div className="truncate">
            <span className="font-mono font-bold text-xs text-slate-900 mr-1.5">
              {selectedJob ? selectedJob.id : 'Select Job'}
            </span>
            {selectedJob && (
              <span className="text-xs text-slate-600 truncate">
                {selectedJob.client} ({selectedJob.rig || 'Rig N/A'})
              </span>
            )}
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 ml-1.5 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-[380px] max-w-[90vw] bg-white rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
          {/* Search Header */}
          <div className="p-2 border-b border-slate-200 bg-slate-50/80">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by Job #, Client, Rig, Well, PO..."
                className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-300 rounded text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
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
                  className="text-blue-600 hover:underline font-medium"
                >
                  Clear filter
                </button>
              )}
            </div>
          </div>

          {/* Job List */}
          <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100">
            {filteredJobs.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
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
                    className={`w-full p-2.5 text-left flex items-start justify-between transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 hover:bg-blue-100/70 text-blue-950 font-medium'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="space-y-0.5 min-w-0 pr-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-xs text-slate-900">{job.id}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${getStatusBadgeClass(job.status)}`}>
                          {job.status}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-slate-800 truncate">
                        {job.client}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center space-x-2 truncate">
                        <span>Rig: {job.rig || 'N/A'}</span>
                        <span>•</span>
                        <span>Well: {job.well || 'N/A'}</span>
                        {job.poNumber && (
                          <>
                            <span>•</span>
                            <span className="font-mono">PO: {job.poNumber}</span>
                          </>
                        )}
                      </div>
                      {job.draftInvoiceNumber && (
                        <div className="text-[10px] text-amber-700 font-mono">
                          Draft Inv #{job.draftInvoiceNumber}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-blue-600 shrink-0 mt-1" />
                    )}
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
