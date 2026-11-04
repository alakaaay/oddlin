// Loads public/funnel.json into funnels and funnel_steps. Run after any change to the funnel:
//   node scripts/seed-funnel.js
// A funnel version is meant to stay fixed once it gets traffic: when you change questions or the order of steps,
// bump "version" in funnel.json and seed again, so old sessions keep pointing at the steps they actually saw.

const fs = require('fs');
const path = require('path');
const { Client, loadEnv } = require('./db');

const lit = v => v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`;

async function main() {
  loadEnv();
  const funnel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'funnel.json'), 'utf8'));
  const rows = funnel.steps.map((s, i) =>
    `(${i}, ${lit(s.key)}, ${lit(s.type)}, ${lit(s.question)}, ${s.options ? lit(JSON.stringify(s.options)) + '::jsonb' : 'null::jsonb'})`);

  const sql = `
    insert into funnels (slug, version, name)
    values (${lit(funnel.slug)}, ${Number(funnel.version)}, ${lit(funnel.name)})
    on conflict (slug, version) do update set name = excluded.name;

    insert into funnel_steps (funnel_id, step_number, step_key, type, question, options)
    select f.id, v.n, v.k, v.t, v.q, v.o
    from funnels f, (values ${rows.join(',\n      ')}) as v(n, k, t, q, o)
    where f.slug = ${lit(funnel.slug)} and f.version = ${Number(funnel.version)}
    on conflict (funnel_id, step_key) do update
      set step_number = excluded.step_number, type = excluded.type, question = excluded.question, options = excluded.options;

    select f.slug, f.version, count(s.id) as steps
    from funnels f join funnel_steps s on s.funnel_id = f.id
    where f.slug = ${lit(funnel.slug)} and f.version = ${Number(funnel.version)}
    group by f.slug, f.version;`;

  const client = new Client(process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL);
  await client.connect();
  const res = await client.query(sql);
  client.end();
  if (res.error) throw new Error(res.error.M);
  const [slug, version, steps] = res.rows[0];
  console.log(`Funnel ${slug} v${version}: ${steps} steps in the database`);
}

main().catch(err => { console.error(`Failed: ${err.message}`); process.exit(1); });
