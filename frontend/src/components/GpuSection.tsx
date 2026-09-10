/**
 * GPU section: driver summary plus one card per device.
 *
 * Three distinct non-happy states are handled separately and calmly:
 *   - no payload yet      → static skeleton
 *   - `available === false` → "NVIDIA GPU unavailable" (a driver condition, not an error)
 *   - zero devices        → "no GPUs reported"
 */

import { NA } from '../lib/format'
import type { GpuCollection } from '../types/api'
import { EmptyState } from './EmptyState'
import { GpuCard } from './GpuCard'
import { IconServer } from './Icons'
import { LoadingState } from './LoadingState'
import { SectionHeader } from './SectionHeader'

export interface GpuSectionProps {
  collection: GpuCollection | undefined
}

function driverSummary(collection: GpuCollection): string {
  const parts: string[] = []
  if (collection.driver_version) parts.push(`driver ${collection.driver_version}`)
  if (collection.cuda_version) parts.push(`CUDA ${collection.cuda_version}`)
  if (collection.nvml_version) parts.push(`NVML ${collection.nvml_version}`)
  return parts.length > 0 ? parts.join(' · ') : NA
}

export function GpuSection({ collection }: GpuSectionProps) {
  return (
    <section data-testid="gpu-section" className="flex flex-col gap-3">
      <SectionHeader
        title="GPUS"
        meta={collection ? driverSummary(collection) : 'waiting for the first sample'}
      />

      {collection === undefined ? (
        <LoadingState label="Loading GPU telemetry…" />
      ) : collection.available === false ? (
        <EmptyState
          title="NVIDIA GPU unavailable"
          detail={collection.error}
          hint="LabWatch is still monitoring CPU, RAM and disk on this host."
          icon={<IconServer size={20} />}
        />
      ) : collection.gpus.length === 0 ? (
        <EmptyState
          title="No GPUs reported"
          hint="The driver loaded successfully but did not report any devices."
          icon={<IconServer size={20} />}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
          {collection.gpus.map((gpu) => (
            <GpuCard key={gpu.uuid ?? `gpu-${gpu.index}`} gpu={gpu} />
          ))}
        </div>
      )}
    </section>
  )
}
