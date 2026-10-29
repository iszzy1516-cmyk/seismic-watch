/**
 * Endpoint latency benchmark.
 *
 * Usage:
 *   node bench/benchmark.js                 # benchmark current DB contents
 *   node bench/benchmark.js --scale 100000  # insert 100k synthetic rows, benchmark, remove them
 *
 * Synthetic rows are inserted with id prefix 'bench-' and always deleted on exit,
 * so the benchmark never pollutes real data.
 */
const { Pool } = require('pg');

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
const ITERATIONS = Number(process.argv.includes('--iters')
  ? process.argv[process.argv.indexOf('--iters') + 1]
  : 20);
const SCALE = process.argv.includes('--scale')
  ? Number(process.argv[process.argv.indexOf('--scale') + 1])
  : 0;

const CASES = [
  ['GET /api/quakes (world)', '/api/quakes?limit=20000'],
  ['GET /api/quakes (Japan bbox)', '/api/quakes?bbox=129,30,147,46&limit=20000'],
  ['GET /api/quakes (minMag=4.5, world)', '/api/quakes?minMag=4.5&limit=20000'],
  ['GET /api/heatmap (precision 0.5)', '/api/heatmap?precision=0.5'],
  ['GET /api/heatmap (precision 2.0)', '/api/heatmap?precision=2'],
  ['GET /api/analytics/summary', '/api/analytics/summary'],
  ['GET /api/analytics/timeseries (30d)', '/api/analytics/timeseries?days=30'],
  ['GET /api/zones (with quakeCount)', '/api/zones'],
];

async function timeRequest(path) {
  const start = performance.now();
  const res = await fetch(BASE_URL + path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  await res.json(); // include body parse/transfer in the measurement
  return performance.now() - start;
}

const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const fmt = (n) => (n < 10 ? n.toFixed(1) : Math.round(n)).toString().padStart(8);

async function seedSynthetic(pool, n) {
  console.log(`Seeding ${n} synthetic rows (bench-*)...`);
  const CHUNK = 5000;
  for (let i = 0; i < n; i += CHUNK) {
    const rows = [];
    for (let j = i; j < Math.min(i + CHUNK, n); j++) {
      rows.push({
        id: `bench-${j}`,
        mag: 2.5 + Math.random() * 5.5,
        place: 'bench',
        time: new Date(Date.now() - Math.random() * 30 * 86400_000).toISOString(),
        depth_km: Math.random() * 700,
        tsunami: false,
        lon: Math.random() * 360 - 180,
        lat: Math.random() * 170 - 85,
      });
    }
    await pool.query(
      `INSERT INTO quakes (id, mag, place, time, depth_km, tsunami, geom)
       SELECT id, mag, place, "time", depth_km, tsunami,
              ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
       FROM json_to_recordset($1::json) AS x(
         id text, mag double precision, place text,
         "time" timestamptz, depth_km double precision,
         tsunami boolean, lon double precision, lat double precision
       )
       ON CONFLICT (id) DO NOTHING`,
      [JSON.stringify(rows)]
    );
  }
  const { rows } = await pool.query("SELECT count(*) FROM quakes WHERE id LIKE 'bench-%'");
  console.log(`Synthetic rows present: ${rows[0].count}`);
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let synth = 0;
  try {
    if (SCALE > 0) {
      await seedSynthetic(pool, SCALE);
      synth = SCALE;
    }
    const { rows } = await pool.query('SELECT count(*) FROM quakes');
    console.log(`Total quakes in table: ${rows[0].count}\n`);
    console.log('Endpoint'.padEnd(38) + 'median ms'.padStart(10) + 'min'.padStart(9) + 'max'.padStart(9));
    console.log('-'.repeat(66));

    const results = [];
    for (const [name, path] of CASES) {
      const samples = [];
      for (let i = 0; i < ITERATIONS; i++) samples.push(await timeRequest(path));
      results.push({ name, median: median(samples), min: Math.min(...samples), max: Math.max(...samples) });
      console.log(name.padEnd(38) + fmt(median(samples)) + fmt(Math.min(...samples)) + fmt(Math.max(...samples)));
    }
    return results;
  } finally {
    if (synth > 0) {
      console.log(`\nCleaning up ${synth} synthetic rows...`);
      await pool.query("DELETE FROM quakes WHERE id LIKE 'bench-%'");
      console.log('Cleanup done.');
    }
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
