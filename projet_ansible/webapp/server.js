/**
 * Ansible Manager - Serveur Node.js/Express
 * API REST + fichiers statiques HTML/JS
 */

const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Chemins
const PROJECT_PATH = path.join(__dirname, '..');
const HOSTS_FILE = path.join(PROJECT_PATH, 'hosts');
const HOST_VARS_PATH = path.join(PROJECT_PATH, 'host_vars');

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Stockage des logs
let executionLogs = [];

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

function getHosts() {
  const hosts = [];
  let currentGroup = null;
  const groupNames = new Set(); // Pour stocker les noms de groupes
  let isChildrenGroup = false; // Pour détecter les groupes :children

  try {
    const content = fs.readFileSync(HOSTS_FILE, 'utf-8');
    const lines = content.split('\n');

    // Premier passage : collecter tous les noms de groupes
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        let groupName = trimmed.slice(1, -1);
        // Enlever les suffixes comme :children, :vars
        groupName = groupName.split(':')[0];
        groupNames.add(groupName);
      }
    }

    // Deuxième passage : extraire les hôtes
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        currentGroup = trimmed.slice(1, -1);
        // Vérifier si c'est un groupe :children ou :vars (pas de vrais hôtes)
        isChildrenGroup = currentGroup.includes(':children') || currentGroup.includes(':vars');
        currentGroup = currentGroup.split(':')[0];
        continue;
      }

      // Ignorer les lignes dans les groupes :children (ce sont des références à d'autres groupes)
      if (isChildrenGroup) continue;

      const parts = trimmed.split(/\s+/);
      if (parts.length > 0) {
        const hostname = parts[0];

        // Ignorer si c'est un nom de groupe (référence dans :children)
        if (groupNames.has(hostname)) continue;

        const hostInfo = {
          name: hostname,
          group: currentGroup,
          ansible_host: hostname,
          ansible_user: 'root',
          vars: {},
        };

        for (let i = 1; i < parts.length; i++) {
          if (parts[i].includes('=')) {
            const [key, value] = parts[i].split('=');
            hostInfo[key] = value;
          }
        }

        const hostVarsFile = path.join(HOST_VARS_PATH, `${hostname}.yml`);
        if (fs.existsSync(hostVarsFile)) {
          try {
            const varsContent = fs.readFileSync(hostVarsFile, 'utf-8');
            varsContent.split('\n').forEach((l) => {
              const match = l.match(/^(\w+):\s*(.+)$/);
              if (match) {
                let val = match[2].trim();
                if (val === 'true') val = true;
                if (val === 'false') val = false;
                hostInfo.vars[match[1]] = val;
              }
            });
          } catch (e) {}
        }

        hosts.push(hostInfo);
      }
    }
  } catch (error) {
    console.error('Erreur lecture hosts:', error);
  }

  return hosts;
}

function checkHostStatus(hostname) {
  return new Promise((resolve) => {
    exec(`ping -c 1 -W 1 ${hostname}`, (error) => {
      resolve(!error);
    });
  });
}

async function getAllHostsStatus() {
  const hosts = getHosts();
  const status = {};

  await Promise.all(
    hosts.map(async (host) => {
      const hostname = host.ansible_host || host.name;
      status[host.name] = await checkHostStatus(hostname);
    }),
  );

  return status;
}

function runAnsibleCommand(command, description) {
  return new Promise((resolve) => {
    const timestamp = new Date().toLocaleString('fr-FR');
    console.log(`\n[${timestamp}] ${command}`);

    exec(
      command,
      {
        cwd: PROJECT_PATH,
        timeout: 300000,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const log = {
          id: Date.now(),
          command: description,
          full_command: command,
          timestamp: timestamp,
          status: error ? 'error' : 'success',
          output: stdout || stderr || 'Aucune sortie',
        };

        executionLogs.unshift(log);
        if (executionLogs.length > 50) {
          executionLogs = executionLogs.slice(0, 50);
        }

        resolve(log);
      },
    );
  });
}

function addHostToInventory(name, ip, user, group = 'remote', password = null) {
  try {
    let content = fs.readFileSync(HOSTS_FILE, 'utf-8');
    const lines = content.split('\n');

    let groupIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === `[${group}]`) {
        groupIndex = i;
        break;
      }
    }

    const newLine = `${name} ansible_host=${ip} ansible_user=${user}`;

    if (groupIndex !== -1) {
      lines.splice(groupIndex + 1, 0, newLine);
    } else {
      lines.push('', `[${group}]`, newLine);
    }

    fs.writeFileSync(HOSTS_FILE, lines.join('\n'));

    // Créer le fichier host_vars avec le mot de passe sudo si fourni
    if (password) {
      // Échapper les caractères spéciaux pour YAML (utiliser single quotes et doubler les ')
      const escapedPassword = password.replace(/'/g, "''");
      const hostVarsContent = `# Variables pour ${name}
ansible_become: true
ansible_become_method: sudo
ansible_become_password: '${escapedPassword}'
`;
      fs.writeFileSync(path.join(HOST_VARS_PATH, `${name}.yml`), hostVarsContent);
    }

    return true;
  } catch (error) {
    console.error('Erreur ajout hôte:', error);
    return false;
  }
}

function removeHostFromInventory(hostname) {
  try {
    const content = fs.readFileSync(HOSTS_FILE, 'utf-8');
    const lines = content.split('\n');

    const newLines = lines.filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith(hostname + ' ') && trimmed !== hostname;
    });

    fs.writeFileSync(HOSTS_FILE, newLines.join('\n'));

    const hostVarsFile = path.join(HOST_VARS_PATH, `${hostname}.yml`);
    if (fs.existsSync(hostVarsFile)) {
      fs.unlinkSync(hostVarsFile);
    }

    return true;
  } catch (error) {
    console.error('Erreur suppression hôte:', error);
    return false;
  }
}

// ============================================
// API REST
// ============================================

// Récupérer tous les hôtes avec statut
app.get('/api/hosts', async (req, res) => {
  const hosts = getHosts();
  const status = await getAllHostsStatus();

  hosts.forEach((host) => {
    host.online = status[host.name] || false;
  });

  res.json({
    hosts,
    online_count: Object.values(status).filter((s) => s).length,
    total_count: hosts.length,
  });
});

// Récupérer un hôte spécifique
app.get('/api/hosts/:hostname', async (req, res) => {
  const hosts = getHosts();
  const host = hosts.find((h) => h.name === req.params.hostname);

  if (!host) {
    return res.status(404).json({ error: 'Hôte non trouvé' });
  }

  host.online = await checkHostStatus(host.ansible_host || host.name);
  res.json(host);
});

// Ajouter un hôte avec configuration SSH automatique
app.post('/api/hosts', (req, res) => {
  const { name, ip, user, password, group } = req.body;

  if (!name || !ip) {
    return res.status(400).json({ error: 'Nom et IP requis' });
  }

  const sshUser = user || 'root';
  const sshGroup = group || 'remote';

  // Si un mot de passe est fourni, copier la clé SSH d'abord
  if (password) {
    const command = `sshpass -p '${password.replace(
      /'/g,
      "'\\''",
    )}' ssh-copy-id -o StrictHostKeyChecking=no ${sshUser}@${ip}`;

    exec(command, { timeout: 60000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('Erreur ssh-copy-id:', stderr);
        return res.status(500).json({
          error: 'Échec de la configuration SSH. Vérifiez le mot de passe.',
          details: stderr || error.message,
        });
      }

      // Clé copiée avec succès, ajouter l'hôte à l'inventaire avec le mot de passe sudo
      if (addHostToInventory(name, ip, sshUser, sshGroup, password)) {
        res.json({
          success: true,
          message: `Hôte ${name} ajouté et configuré avec succès`,
        });
      } else {
        res.status(500).json({ error: "Erreur lors de l'ajout à l'inventaire" });
      }
    });
  } else {
    // Pas de mot de passe, ajouter directement (pour localhost par exemple)
    if (addHostToInventory(name, ip, sshUser, sshGroup)) {
      res.json({ success: true, message: `Hôte ${name} ajouté` });
    } else {
      res.status(500).json({ error: "Erreur lors de l'ajout" });
    }
  }
});

// Copier la clé SSH vers un hôte
app.post('/api/hosts/:hostname/copy-key', (req, res) => {
  const { hostname } = req.params;
  const { password } = req.body;

  const hosts = getHosts();
  const host = hosts.find((h) => h.name === hostname);

  if (!host) {
    return res.status(404).json({ error: 'Hôte non trouvé' });
  }

  if (!password) {
    return res.status(400).json({ error: 'Mot de passe requis' });
  }

  const ip = host.ansible_host || host.name;
  const user = host.ansible_user || 'root';

  // Utiliser sshpass pour copier la clé
  const command = `sshpass -p '${password.replace(
    /'/g,
    "'\\''",
  )}' ssh-copy-id -o StrictHostKeyChecking=no ${user}@${ip}`;

  exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
    if (error) {
      console.error('Erreur ssh-copy-id:', stderr);
      res.status(500).json({
        error: 'Échec de la copie de clé SSH',
        details: stderr || error.message,
      });
    } else {
      res.json({
        success: true,
        message: `Clé SSH copiée vers ${hostname}. Vous pouvez maintenant vous connecter sans mot de passe.`,
      });
    }
  });
});

// Supprimer un hôte
app.delete('/api/hosts/:hostname', (req, res) => {
  const { hostname } = req.params;

  if (hostname === 'localhost') {
    return res.status(400).json({ error: 'Impossible de supprimer localhost' });
  }

  if (removeHostFromInventory(hostname)) {
    res.json({ success: true, message: `Hôte ${hostname} supprimé` });
  } else {
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

// Récupérer les logs
app.get('/api/logs', (req, res) => {
  res.json(executionLogs);
});

// ============================================
// EXÉCUTION ANSIBLE
// ============================================

// Fonction pour envoyer une notification
async function sendNotification(action, hosts, status) {
  const command = `ansible-playbook -i hosts test_notification.yml -e "tasks_executed='${action} sur ${hosts}'"`;
  return runAnsibleCommand(command, `Notification: ${action}`);
}

app.post('/api/run/ping', async (req, res) => {
  const hosts = req.body.hosts || 'all';
  const notify = req.body.notify || false;
  const command = `ansible ${hosts} -i hosts -m ping`;
  const result = await runAnsibleCommand(command, `Ping ${hosts}`);
  if (notify && result.status === 'success') {
    await sendNotification('Ping', hosts, result.status);
  }
  res.json(result);
});

app.post('/api/run/update', async (req, res) => {
  const hosts = req.body.hosts || 'all';
  const notify = req.body.notify || false;
  const limit = hosts !== 'all' ? ` --limit ${hosts}` : '';
  const command = `ansible-playbook -i hosts site.yml --tags update${limit}`;
  const result = await runAnsibleCommand(command, `Mise à jour ${hosts}`);
  if (notify && result.status === 'success') {
    await sendNotification('Mise à jour', hosts, result.status);
  }
  res.json(result);
});

app.post('/api/run/cleanup', async (req, res) => {
  const hosts = req.body.hosts || 'all';
  const notify = req.body.notify || false;
  const limit = hosts !== 'all' ? ` --limit ${hosts}` : '';
  const command = `ansible-playbook -i hosts site.yml --tags cleanup${limit}`;
  const result = await runAnsibleCommand(command, `Nettoyage ${hosts}`);
  if (notify && result.status === 'success') {
    await sendNotification('Nettoyage', hosts, result.status);
  }
  res.json(result);
});

app.post('/api/run/network', async (req, res) => {
  const hosts = req.body.hosts || 'all';
  const notify = req.body.notify || false;
  const limit = hosts !== 'all' ? ` --limit ${hosts}` : '';
  const command = `ansible-playbook -i hosts site.yml --tags network${limit}`;
  const result = await runAnsibleCommand(command, `Réseau ${hosts}`);
  if (notify && result.status === 'success') {
    await sendNotification('Configuration réseau', hosts, result.status);
  }
  res.json(result);
});

app.post('/api/run/mariadb', async (req, res) => {
  const hosts = req.body.hosts || 'all';
  const notify = req.body.notify || false;
  const limit = hosts !== 'all' ? ` --limit ${hosts}` : '';
  const command = `ansible-playbook -i hosts site.yml --tags mariadb${limit}`;
  const result = await runAnsibleCommand(command, `MariaDB ${hosts}`);
  if (notify && result.status === 'success') {
    await sendNotification('Installation MariaDB', hosts, result.status);
  }
  res.json(result);
});

app.post('/api/run/full', async (req, res) => {
  const hosts = req.body.hosts || 'all';
  const notify = req.body.notify || false;
  const limit = hosts !== 'all' ? ` --limit ${hosts}` : '';
  const command = `ansible-playbook -i hosts site.yml${limit}`;
  const result = await runAnsibleCommand(command, `Exécution complète ${hosts}`);
  if (notify && result.status === 'success') {
    await sendNotification('Maintenance complète', hosts, result.status);
  }
  res.json(result);
});

// Endpoint pour tester les notifications
app.post('/api/run/notification', async (req, res) => {
  const command = `ansible-playbook -i hosts test_notification.yml`;
  const result = await runAnsibleCommand(command, `Test notification email`);
  res.json(result);
});

// ============================================
// DÉMARRAGE
// ============================================

app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║        🚀 Ansible Manager - Node.js/Express          ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  🌐 Interface: http://localhost:${PORT}                  ║`);
  console.log('║  📁 API: /api/hosts, /api/logs, /api/run/*           ║');
  console.log('║  ⚡ Status: En ligne                                  ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
});
