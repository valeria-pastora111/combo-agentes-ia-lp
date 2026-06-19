#!/usr/bin/env node
/**
 * Cria projeto na Vercel e copia chaves FreePay do projeto hubcrm.
 * Uso: node scripts/setup-vercel.mjs
 */
import fs from 'fs';

const HUBCRM_ENV_PATH = process.env.HUBCRM_ENV || '/Users/joaovitor/Desktop/hubcrm/.env';
const NEW_PROJECT = process.env.VERCEL_NEW_PROJECT || 'combo-agentes-ia-lp';
const GITHUB_REPO = process.env.GITHUB_REPO || 'valeria-pastora111/combo-agentes-ia-lp';

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

async function main() {
  const hubEnv = parseEnvFile(HUBCRM_ENV_PATH);
  const token = process.env.VERCEL_TOKEN || hubEnv.VERCEL_TOKEN;
  const sourceProject = hubEnv.VERCEL_PROJECT_NAME || 'hubcrm';
  const teamId = hubEnv.VERCEL_TEAM_ID || '';

  if (!token) throw new Error('VERCEL_TOKEN não encontrado.');

  console.log('→ Buscando chaves FreePay em', sourceProject);
  const sourceEnvs = await api(
    token,
    `/v9/projects/${encodeURIComponent(sourceProject)}/env${teamId ? `?teamId=${teamId}` : ''}`
  );

  const freepayKeys = ['FREEPAY_PUBLIC_KEY', 'FREEPAY_SECRET_KEY'];
  const values = {};
  for (const key of freepayKeys) {
    const row = (sourceEnvs.envs || []).find((e) => e.key === key);
    if (!row) throw new Error(`${key} não encontrada no projeto ${sourceProject}`);
    values[key] = await getEnvValue(token, sourceProject, row.id);
  }

  console.log('→ Criando/verificando projeto', NEW_PROJECT);
  let project;
  try {
    project = await api(token, `/v9/projects/${encodeURIComponent(NEW_PROJECT)}${teamId ? `?teamId=${teamId}` : ''}`);
    console.log('  Projeto existente:', project.id);
  } catch {
    project = await api(token, `/v10/projects${teamId ? `?teamId=${teamId}` : ''}`, {
      method: 'POST',
      body: JSON.stringify({
        name: NEW_PROJECT,
        framework: null
      })
    });
    console.log('  Projeto criado:', project.id);
  }

  const deploymentUrl = `https://${NEW_PROJECT}.vercel.app`;
  const siteUrl = deploymentUrl;
  const postbackUrl = `${siteUrl}/api/webhooks/freepay`;

  console.log('→ Configurando variáveis em', NEW_PROJECT);
  await upsertEnv(token, NEW_PROJECT, { key: 'FREEPAY_PUBLIC_KEY', value: values.FREEPAY_PUBLIC_KEY, teamId });
  await upsertEnv(token, NEW_PROJECT, { key: 'FREEPAY_SECRET_KEY', value: values.FREEPAY_SECRET_KEY, teamId });
  await upsertEnv(token, NEW_PROJECT, { key: 'SITE_URL', value: siteUrl, teamId });
  await upsertEnv(token, NEW_PROJECT, { key: 'FREEPAY_POSTBACK_URL', value: postbackUrl, teamId });

  console.log('→ Disparando deploy de produção (CLI)');
  console.log('\n✅ Setup concluído');
  console.log('   LP:', siteUrl);
  console.log('   Checkout:', `${siteUrl}/checkout`);
  console.log('   Webhook:', postbackUrl);
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
