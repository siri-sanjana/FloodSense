'use client';

import React from 'react';
import { DamageStats } from '../lib/types';

interface DamageTableProps {
  stats: DamageStats;
}

export const DamageTable: React.FC<DamageTableProps> = ({ stats }) => {
  return (
    <div className="w-full bg-white border border-slate-200 rounded-xl overflow-hidden font-mono text-xs shadow-xs">
      {/* Top summary row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-slate-200 text-center">
        <div className="bg-slate-50 p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Flood-Class Pixels</div>
          <div className="text-sm font-bold text-slate-900 mt-0.5">
            {stats.total_inundated_pixels.toLocaleString()} px
          </div>
        </div>
        <div className="bg-slate-50 p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Building Class Components</div>
          <div className="text-sm font-bold text-red-600 mt-0.5">
            {stats.flooded_buildings_count} <span className="text-[10px] text-slate-500 font-normal">/ {stats.flooded_buildings_count + stats.safe_buildings_count}</span>
          </div>
        </div>
        <div className="bg-slate-50 p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
            {stats.flooded_roads_coverage_pct != null ? 'Road-Flooded Pixel Share' : 'Flooded Roads'}
          </div>
          <div className="text-sm font-bold text-amber-700 mt-0.5">
            {stats.flooded_roads_coverage_pct != null
              ? `${stats.flooded_roads_coverage_pct.toFixed(2)}%`
              : 'Not available'}
          </div>
        </div>
      </div>
      <p className="bg-amber-50 px-3 py-2 text-[10px] text-amber-900">
        Coverage and component counts come from predicted image pixels. They are not
        georeferenced area, calibrated flood depth, or verified incident severity.
      </p>

      {/* Class breakdown table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              <th className="py-2.5 px-3">Class Category</th>
              <th className="py-2.5 px-3">Pixel Count</th>
              <th className="py-2.5 px-3">Coverage</th>
              <th className="py-2.5 px-3 text-right">Predicted Class Group</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-[11px]">
            {stats.classes.map((cls) => (
              <tr key={cls.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="py-2 px-3 flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: cls.color }} />
                  <span className="text-slate-800 font-medium">{cls.name}</span>
                </td>
                <td className="py-2 px-3 text-slate-600">
                  {cls.pixel_count.toLocaleString()} px
                </td>
                <td className="py-2 px-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(cls.percentage, 100)}%`,
                          backgroundColor: cls.color,
                        }}
                      />
                    </div>
                    <span className="text-slate-500 text-[10px]">{cls.percentage.toFixed(1)}%</span>
                  </div>
                </td>
                <td className="py-2 px-3 text-right">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      cls.is_flooded
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {cls.is_flooded ? 'FLOOD-ASSOCIATED' : 'OTHER CLASS'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
