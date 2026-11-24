<script lang="ts">
  import { BarController, BarElement, CategoryScale, Chart, LinearScale, LineController, LineElement, PointElement, Tooltip } from 'chart.js';
  import type { ChartBlock } from '../lib/workspace';
  import type { chartSeries } from '../lib/format';

  Chart.register(BarController, BarElement, CategoryScale, LinearScale, LineController, LineElement, PointElement, Tooltip);

  let { series, type, dark = false, compact = false }: {
    series: NonNullable<ReturnType<typeof chartSeries>>;
    type: ChartBlock['chart'];
    dark?: boolean;
    compact?: boolean;
  } = $props();
  let canvas: HTMLCanvasElement;
  const number = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

  $effect(() => {
    const accent = dark ? '#5eead4' : '#159d91';
    const muted = dark ? '#a3b2c7' : '#66758a';
    const grid = dark ? '#39465a' : '#e8edf2';
    const kind = type;
    const chart = new Chart(canvas, {
      type: kind,
      data: {
        labels: series.labels,
        datasets: [{
          label: series.label,
          data: series.values,
          backgroundColor: kind === 'bar' ? accent : 'transparent',
          borderColor: accent,
          borderRadius: 4,
          borderWidth: kind === 'line' ? 2.5 : 0,
          maxBarThickness: compact ? 38 : 76,
          pointRadius: compact ? 2 : 3,
          tension: .25,
        }],
      },
      options: {
        animation: false,
        maintainAspectRatio: false,
        layout: { padding: { top: 3, right: 4 } },
        interaction: { intersect: false, mode: 'index' },
        scales: {
          x: {
            border: { display: false },
            grid: { display: false },
            ticks: { color: muted, font: { family: 'Inter Variable', size: compact ? 9 : 11 }, maxRotation: 0, maxTicksLimit: compact ? 5 : 12 },
          },
          y: {
            beginAtZero: true,
            border: { display: false, dash: [3, 3] },
            grid: { color: grid, drawTicks: false },
            ticks: { color: muted, padding: 6, font: { family: 'Inter Variable', size: compact ? 8 : 10 }, maxTicksLimit: compact ? 4 : 6, callback: (value) => number.format(Number(value)) },
          },
        },
      },
    });
    return () => chart.destroy();
  });
</script>

<div class="chart-figure" role="img" aria-label={series.label + ' chart'}>
  <canvas bind:this={canvas} aria-hidden="true"></canvas>
</div>
