#!/usr/bin/env node
/**
 * Configura variáveis de pagamento PIX na Vercel.
 * Uso: VERCEL_TOKEN=... SOURCE_PROJECT=... node scripts/setup-vercel.mjs
 */
import fs from 'fs';

const ENV_FILE = process.env.ENV_FILE || '.env';
const PROJECT = process.env.VERCEL_PROJECT || 'combo-agentes-ia-lp';

function parseEnvFile(path) {
  const env = {};
  if (!fs.existsSync(path)) return env;
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

async function api(token, path, options = {}) {
  const res = await fetch(`https://api.vercel.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || data.message || `HTTP ${res.status}`);
  return data;
}

async function getEnvValue(token, project, envId) {
  const data = await api(token, `/v1/projects/${encodeURIComponent(project)}/env/${envId}`);
  return data.value ?? data.env?.value ?? '';
}

async function upsertEnv(token, project, { key, value, teamId }) {
  const qs = teamId ? `?teamId=${teamId}` : '';
  const list = await api(token, `/v9/projects/${encodeURIComponent(project)}/env${qs}`);
  const found = (list.envs || []).find((e) => e.key === key);
  if (found) {
    await api(token, `/v9/projects/${encodeURIComponent(project)}/env/${found.id}${qs}`, {
      method: 'PATCH',
      body: JSON.stringify({ value, target: ['production', 'preview', 'development'], type: 'encrypted' })
    });
    return 'updated';
  }
  await api(token, `/v10/projects/${encodeURIComponent(project)}/env${qs}`, {
    method: 'POST',
    body: JSON.stringify({ key, value, target: ['production', 'preview', 'development'], type: 'encrypted' })
  });
  return 'created';
}

async function readPaymentKeys(token, sourceProject, teamId) {
  const qs = teamId ? `?teamId=${teamId}` : '';
  const sourceEnvs = await api(token, `/v9/projects/${encodeURIComponent(sourceProject)}/env${qs}`);
  const keyNames = ['PAYMENT_PUBLIC_KEY', 'PAYMENT_SECRET_KEY', 'PAYMENT_API_URL'];
  const values = {};

  for (const key of keyNames) {
    const row = (sourceEnvs.envs || []).find((e) => e.key === key);
    if (row) values[key] = await getEnvValue(token, sourceProject, row.id);
  }

  if (!values.PAYMENT_PUBLIC_KEY || !values.PAYMENT_SECRET_KEY) {
    throw new Error('Chaves PAYMENT_PUBLIC_KEY / PAYMENT_SECRET_KEY não encontradas no projeto origem.');
  }

  return values;
}

async function main() {
  const localEnv = parseEnvFile(ENV_FILE);
  const token = process.env.VERCEL_TOKEN || localEnv.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID || localEnv.VERCEL_TEAM_ID || '';
  const sourceProject = process.env.SOURCE_PROJECT || localEnv.SOURCE_PROJECT || PROJECT;

  if (!token) throw new Error('VERCEL_TOKEN não encontrado.');

  console.log('→ Lendo chaves de pagamento em', sourceProject);
  const values = await readPaymentKeys(token, sourceProject, teamId);

  const siteUrl = process.env.SITE_URL || `https://${PROJECT}.vercel.app`;
  const webhookUrl = `${siteUrl.replace(/\/$/, '')}/api/webhooks/pix`;
  const apiUrl = values.PAYMENT_API_URL || process.env.PAYMENT_API_URL || localEnv.PAYMENT_API_URL;

  if (!apiUrl) {
    throw new Error('Defina PAYMENT_API_URL (URL base do gateway).');
  }

  console.log('→ Configurando variáveis em', PROJECT);
  await upsertEnv(token, PROJECT, { key: 'PAYMENT_PUBLIC_KEY', value: values.PAYMENT_PUBLIC_KEY, teamId });
  await upsertEnv(token, PROJECT, { key: 'PAYMENT_SECRET_KEY', value: values.PAYMENT_SECRET_KEY, teamId });
  await upsertEnv(token, PROJECT, { key: 'PAYMENT_API_URL', value: apiUrl, teamId });
  await upsertEnv(token, PROJECT, { key: 'SITE_URL', value: siteUrl, teamId });
  await upsertEnv(token, PROJECT, { key: 'PAYMENT_WEBHOOK_URL', value: webhookUrl, teamId });

  console.log('\n✅ Setup concluído');
  console.log('   LP:', siteUrl);
  console.log('   Checkout:', `${siteUrl}/checkout`);
  console.log('   Webhook:', webhookUrl);
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
