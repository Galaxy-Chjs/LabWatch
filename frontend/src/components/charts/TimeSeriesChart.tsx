/**
 * One time-series line chart.
 *
 * The x axis is a numeric time scale with `domain={['dataMin','dataMax']}` so
 * uneven sample spacing renders honestly. Ticks and grid are as quiet as the
 * theme allows, animation is off (nothing on this dashboard moves on its own),
 * and the tooltip is themed rather than Recharts' white default.
 */

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { HistoryRange } from '../../types/api'
import { ChartTooltip } from './ChartTooltip'
import {
  AXIS_TICK,
  CHART_HEIGHT,
  CHART_MARGIN,
  LEGEND_STYLE,
  TOOLTIP_CURSOR,
  axisTimeLabel,
} from './chartTheme'
import type { ChartRow, SeriesDef } from './seriesData'

export interface TimeSeriesChartProps {
  data: ChartRow[]
  series: readonly SeriesDef[]
  range: HistoryRange
  /** Render one tooltip value, e.g. `formatPercent`. */
  formatValue: (value: number) => string
  /** Fixed y domain for percentage charts; `'auto'` for temperatures. */
  yDomain?: [number | string, number | string]
  yTickFormatter?: (value: number) => string
}

export function TimeSeriesChart({
  data,
  series,
  range,
  formatValue,
  yDomain = [0, 100],
  yTickFormatter,
}: TimeSeriesChartProps) {
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <LineChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid stroke="var(--lw-line)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(value: number) => axisTimeLabel(value, range)}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          minTickGap={40}
        />
        <YAxis
          domain={yDomain}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          width={44}
          tickFormatter={yTickFormatter}
        />
        <Tooltip
          content={<ChartTooltip formatValue={formatValue} />}
          cursor={TOOLTIP_CURSOR}
          isAnimationActive={false}
        />
        <Legend wrapperStyle={LEGEND_STYLE} iconType="plainline" iconSize={14} />
        {series.map((definition) => (
          <Line
            key={definition.key}
            type="linear"
            dataKey={definition.key}
            name={definition.name}
            stroke={definition.color}
            strokeWidth={1.75}
            dot={false}
            activeDot={{ r: 2.5, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
