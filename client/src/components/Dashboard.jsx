import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { api } from '../lib/api.js';

const CHART_H = 250;

function ChartFrame({ title, loading, error, empty, children }) {
  return (
    <div className="chart">
      <h3 className="chart-title">{title}</h3>
      <div className="chart-body" style={{ height: CHART_H }}>
        {loading && <div className="chart-note">Loading…</div>}
        {!loading && error && <div className="chart-note chart-error">{error}</div>}
        {!loading && !error && empty && <div className="chart-note">No data</div>}
        {!loading && !error && !empty && children}
      </div>
    </div>
  );
}

function useChartData(path, params) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    api
      .getJson(path, params)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ data: null, loading: false, error: err.message });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(params)]);
  return state;
}

function MagnitudeHist() {
  const { data, loading, error } = useChartData('/api/analytics/magnitude-hist');
  const ref = useRef(null);
  const empty = !data || data.length === 0;

  useEffect(() => {
    if (empty || !ref.current) return;
    const el = ref.current;
    el.innerHTML = '';
    const width = el.clientWidth || 300;
    const margin = { top: 10, right: 8, bottom: 26, left: 34 };
    const innerW = width - margin.left - margin.right;
    const innerH = CHART_H - margin.top - margin.bottom;

    const svg = d3.select(el).append('svg').attr('width', width).attr('height', CHART_H);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleBand()
      .domain(data.map((d) => String(d.bin)))
      .range([0, innerW])
      .padding(0.12);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.count) || 1])
      .nice()
      .range([innerH, 0]);

    g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).tickSizeOuter(0)).selectAll('text').attr('font-size', 9);
    g.append('g').call(d3.axisLeft(y).ticks(4)).selectAll('text').attr('font-size', 9);
    g.selectAll('.domain,.tick line').attr('stroke', '#3a4149');

    g.selectAll('rect')
      .data(data)
      .join('rect')
      .attr('x', (d) => x(String(d.bin)))
      .attr('y', (d) => y(d.count))
      .attr('width', x.bandwidth())
      .attr('height', (d) => innerH - y(d.count))
      .attr('fill', '#d29922')
      .attr('rx', 1);
  }, [data, empty]);

  return (
    <ChartFrame title="Magnitude distribution" loading={loading} error={error} empty={empty}>
      <div ref={ref} className="chart-svg" />
    </ChartFrame>
  );
}

function Timeseries() {
  const { data, loading, error } = useChartData('/api/analytics/timeseries', { days: 30 });
  const ref = useRef(null);
  const empty = !data || data.length === 0;

  useEffect(() => {
    if (empty || !ref.current) return;
    const el = ref.current;
    el.innerHTML = '';
    const width = el.clientWidth || 300;
    const margin = { top: 10, right: 8, bottom: 26, left: 34 };
    const innerW = width - margin.left - margin.right;
    const innerH = CHART_H - margin.top - margin.bottom;

    const svg = d3.select(el).append('svg').attr('width', width).attr('height', CHART_H);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const parse = d3.timeParse('%Y-%m-%d');
    const points = data.map((d) => ({ date: parse(d.date), count: d.count })).filter((d) => d.date);

    const x = d3.scaleTime().domain(d3.extent(points, (d) => d.date)).range([0, innerW]);
    const y = d3.scaleLinear().domain([0, d3.max(points, (d) => d.count) || 1]).nice().range([innerH, 0]);

    g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(5).tickSizeOuter(0)).selectAll('text').attr('font-size', 9);
    g.append('g').call(d3.axisLeft(y).ticks(4)).selectAll('text').attr('font-size', 9);
    g.selectAll('.domain,.tick line').attr('stroke', '#3a4149');

    const area = d3
      .area()
      .x((d) => x(d.date))
      .y0(innerH)
      .y1((d) => y(d.count))
      .curve(d3.curveMonotoneX);
    const line = d3
      .line()
      .x((d) => x(d.date))
      .y((d) => y(d.count))
      .curve(d3.curveMonotoneX);

    g.append('path').datum(points).attr('d', area).attr('fill', 'rgba(47,129,247,0.25)');
    g.append('path').datum(points).attr('d', line).attr('fill', 'none').attr('stroke', '#2f81f7').attr('stroke-width', 1.5);
  }, [data, empty]);

  return (
    <ChartFrame title="Daily activity (30 days)" loading={loading} error={error} empty={empty}>
      <div ref={ref} className="chart-svg" />
    </ChartFrame>
  );
}

function DepthScatter() {
  const { data, loading, error } = useChartData('/api/analytics/depth-scatter', { limit: 2000 });
  const ref = useRef(null);
  const empty = !data || data.length === 0;

  useEffect(() => {
    if (empty || !ref.current) return;
    const el = ref.current;
    el.innerHTML = '';
    const width = el.clientWidth || 300;
    const margin = { top: 10, right: 8, bottom: 26, left: 40 };
    const innerW = width - margin.left - margin.right;
    const innerH = CHART_H - margin.top - margin.bottom;

    const svg = d3.select(el).append('svg').attr('width', width).attr('height', CHART_H);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear().domain([0, d3.max(data, (d) => d.mag) || 1]).nice().range([0, innerW]);
    const maxDepth = d3.max(data, (d) => d.depthKm) || 1;
    const y = d3.scaleLinear().domain([0, maxDepth]).nice().range([innerH, 0]);

    g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(5)).selectAll('text').attr('font-size', 9);
    g.append('g').call(d3.axisLeft(y).ticks(4)).selectAll('text').attr('font-size', 9);
    g.selectAll('.domain,.tick line').attr('stroke', '#3a4149');

    g.append('text').attr('x', innerW / 2).attr('y', CHART_H - 4).attr('text-anchor', 'middle').attr('font-size', 9).attr('fill', '#8b949e').text('magnitude');
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -innerH / 2).attr('y', -30).attr('text-anchor', 'middle').attr('font-size', 9).attr('fill', '#8b949e').text('depth km');

    const color = d3.scaleSequential(d3.interpolateOrRd).domain([0, x.domain()[1]]);
    g.selectAll('circle')
      .data(data)
      .join('circle')
      .attr('cx', (d) => x(d.mag))
      .attr('cy', (d) => y(d.depthKm))
      .attr('r', 2)
      .attr('fill', (d) => color(d.mag))
      .attr('opacity', 0.45);
  }, [data, empty]);

  return (
    <ChartFrame title="Depth vs magnitude" loading={loading} error={error} empty={empty}>
      <div ref={ref} className="chart-svg" />
    </ChartFrame>
  );
}

export default function Dashboard() {
  return (
    <section className="dashboard">
      <MagnitudeHist />
      <Timeseries />
      <DepthScatter />
    </section>
  );
}
