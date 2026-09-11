import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { formatBytesPair, formatPercent } from '../../lib/format'
import { HostSection } from '../HostSection'
import { makeDiskInfo, makeNullSystemStatus, makeSystemStatus } from './fixtures'

describe('HostSection', () => {
  it('renders the four tiles from the payload', () => {
    const system = makeSystemStatus()
    render(<HostSection system={system} />)

    expect(screen.getByRole('heading', { name: 'HOST' })).toBeInTheDocument()
    expect(screen.getByText('CPU')).toBeInTheDocument()
    expect(screen.getByText('RAM')).toBeInTheDocument()
    expect(screen.getByText('Disk')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()

    // CPU
    expect(screen.getAllByText(formatPercent(system.cpu.usage_percent)).length).toBeGreaterThan(0)
    expect(screen.getByText('16 / 32')).toBeInTheDocument()
    expect(screen.getByText('3800 MHz')).toBeInTheDocument()
    expect(screen.getByText('1.25 / 1.10 / 0.90')).toBeInTheDocument()

    // RAM — the free-style breakdown is exposed so the number can be reconciled
    expect(
      screen.getByText(formatBytesPair(system.memory.used, system.memory.total)),
    ).toBeInTheDocument()
    expect(screen.getByText('Cache')).toBeInTheDocument()

    // Disk: the mount point appears in the tile and again in the filesystem list
    expect(screen.getAllByText('/').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('/data').length).toBeGreaterThanOrEqual(1)

    // System
    expect(screen.getByText('lab-gpu-01')).toBeInTheDocument()
    expect(screen.getByText('Ubuntu 24.04.1 LTS')).toBeInTheDocument()
    expect(screen.getByText('4d 7h 30m')).toBeInTheDocument()
  })

  it('lists every reported filesystem, worst first', () => {
    /**
     * Regression from the lab server: a data volume at 98.5% was invisible
     * because only the primary filesystem and two extras were rendered.
     */
    const system = makeSystemStatus({
      disks: [
        makeDiskInfo({ mountpoint: '/', device: '/dev/sda2', percent: 91.6, is_primary: true }),
        makeDiskInfo({ mountpoint: '/nfs-data1', device: '/dev/sdb', percent: 98.5, is_primary: false }),
        makeDiskInfo({ mountpoint: '/nfs-data2', device: '/dev/sdc1', percent: 24.9, is_primary: false }),
        makeDiskInfo({ mountpoint: '/nfs-data3', device: '/dev/sdd', percent: 0.7, is_primary: false }),
        makeDiskInfo({ mountpoint: '/nfs-data4', device: '/dev/sde', percent: 0.7, is_primary: false }),
        makeDiskInfo({ mountpoint: '/boot/efi', device: '/dev/sda1', percent: 1.2, is_primary: false }),
      ],
    })
    render(<HostSection system={system} />)

    const filesystems = screen.getByTestId('filesystems')
    expect(within(filesystems).getByText('6 mounts')).toBeInTheDocument()

    for (const mountpoint of ['/', '/nfs-data1', '/nfs-data2', '/nfs-data3', '/nfs-data4', '/boot/efi']) {
      expect(within(filesystems).getAllByText(mountpoint).length).toBe(1)
    }

    // The primary filesystem leads; the rest follow by usage descending, so the
    // nearly-full volume is the second row rather than hidden.
    const rows = filesystems.querySelectorAll('.divide-y > div')
    const order = Array.from(rows).map((row) => row.querySelector('span')?.textContent)
    expect(order).toHaveLength(6)
    expect(order.slice(0, 3)).toEqual(['/', '/nfs-data1', '/nfs-data2'])
    // Least used last: the 0.7 % volumes, then the 1.2 % EFI partition.
    expect(order.slice(-3)).toEqual(['/boot/efi', '/nfs-data3', '/nfs-data4'])
  })

  it('marks a nearly-full filesystem as critical', () => {
    const system = makeSystemStatus({
      disks: [
        makeDiskInfo({ mountpoint: '/', percent: 40, is_primary: true }),
        makeDiskInfo({ mountpoint: '/nfs-data1', percent: 98.5, is_primary: false }),
      ],
    })
    render(<HostSection system={system} />)

    const filesystems = screen.getByTestId('filesystems')
    const critical = within(filesystems).getByText('98.5%')
    expect(critical.className).toMatch(/crit/)
  })

  it('keeps the layout and renders N/A when no payload has arrived', () => {
    const { container } = render(<HostSection system={undefined} />)

    expect(screen.getByText('CPU')).toBeInTheDocument()
    expect(screen.getByText('RAM')).toBeInTheDocument()
    expect(screen.getByText('Disk')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()
    expect(screen.getAllByText('N/A').length).toBeGreaterThan(5)

    // No sample means no filesystem list, rather than an empty frame.
    expect(screen.queryByTestId('filesystems')).not.toBeInTheDocument()

    const text = container.textContent ?? ''
    expect(text).not.toMatch(/undefined/)
    expect(text).not.toMatch(/NaN/)
  })

  it('renders N/A for a host that reports no metrics', () => {
    const { container } = render(<HostSection system={makeNullSystemStatus()} />)

    expect(screen.getAllByText('N/A').length).toBeGreaterThan(5)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\bnull\b/)
    expect(text).not.toMatch(/undefined/)
    expect(text).not.toMatch(/NaN/)
  })
})
