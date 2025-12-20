const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3001;

app.use(express.static('public'));
app.use(express.json());

// Configuration Ansible commune
const ANSIBLE_PYTHON = '/usr/local/bin/python3.13';
const ANSIBLE_OPTS = `-e ansible_host_key_checking=False -e ansible_python_interpreter=${ANSIBLE_PYTHON}`;

// Route SSH Debian
app.post('/universal-ssh', (req, res) => {
  const { ip, user, ssh, sudo, host } = req.body;
  
  const cmd = `cd ${__dirname} && ansible-playbook playbooks/ssh_debian.yml \
-i "${ip}," -u ${user} \
--extra-vars "ansible_ssh_pass='${ssh}' ansible_become_pass='${sudo}' hostname='${host || 'localhost.local'}'" \
${ANSIBLE_OPTS}`;
  
  console.log(`🔐 SSH pour ${ip} (${user})...`);
  
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Erreur SSH:', stderr);
      return res.json({ success: false, error: stderr.toString().trim() });
    }
    console.log('✅ SSH OK:', ip);
    res.json({ success: true, message: `✅ SSH configuré: ${ip}` });
  });
});

// Route DNS Debian avec sauvegarde
app.post('/universal-dns', (req, res) => {
  const { ip, user, ssh, sudo, host } = req.body;
  
  const cmd = `cd ${__dirname} && ansible-playbook playbooks/dns_debian.yml \
-i "${ip}," -u ${user} \
--extra-vars "ansible_ssh_pass='${ssh}' ansible_become_pass='${sudo}' hostname='${host || 'localhost.local'}'" \
${ANSIBLE_OPTS}`;
  
  console.log(`🌐 DNS pour ${host} → ${ip} (avec sauvegarde)...`);
  
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Erreur DNS:', stderr);
      return res.json({ success: false, error: stderr.toString().trim() });
    }
    
    const backupMatch = stdout.match(/Backup: (\/root\/ansible_backups\/dns_\d+)/);
    const backupPath = backupMatch ? backupMatch[1] : 'Backup créé';
    
    console.log('✅ DNS OK:', host, '- Backup:', backupPath);
    res.json({ 
      success: true, 
      message: `✅ DNS ${host} → ${ip}`,
      backup: backupPath
    });
  });
});

// Route de restauration DNS
app.post('/restore-dns', (req, res) => {
  const { ip, user, ssh, sudo } = req.body;
  
  const cmd = `cd ${__dirname} && ansible -i "${ip}," -u ${user} all \
--extra-vars "ansible_ssh_pass='${ssh}' ansible_become_pass='${sudo}'" \
${ANSIBLE_OPTS} \
-m shell -a "BACKUP_DIR=\\$(ls -td /root/ansible_backups/dns_* 2>/dev/null | head -1) && [ -n \\"\\$BACKUP_DIR\\" ] && bash \\$BACKUP_DIR/restore.sh || echo 'Aucun backup trouvé'" \
-b`;
  
  console.log(`🔄 Restauration DNS pour ${ip}...`);
  
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Erreur restauration:', stderr);
      return res.json({ success: false, error: stderr.toString().trim() });
    }
    
    if (stdout.includes('Aucun backup trouvé')) {
      return res.json({ success: false, error: 'Aucun backup trouvé' });
    }
    
    console.log('✅ Restauration OK:', ip);
    res.json({ success: true, message: `✅ DNS restauré sur ${ip}` });
  });
});

// Route TLS Debian
app.post('/universal-tls', (req, res) => {
  const { ip, user, ssh, sudo, host } = req.body;
  
  const cmd = `cd ${__dirname} && ansible-playbook playbooks/tls_debian.yml \
-i "${ip}," -u ${user} \
--extra-vars "ansible_ssh_pass='${ssh}' ansible_become_pass='${sudo}' hostname='${host || 'localhost.local'}'" \
${ANSIBLE_OPTS}`;
  
  console.log(`🔒 TLS pour ${host}...`);
  
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Erreur TLS:', stderr);
      return res.json({ success: false, error: stderr.toString().trim() });
    }
    console.log('✅ TLS OK:', host);
    res.json({ success: true, message: `✅ TLS https://${host}` });
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Dashboard Ansible: http://localhost:${PORT}`);
  console.log(`📁 Playbooks: ${__dirname}/playbooks/`);
  console.log(`🐍 Python: ${ANSIBLE_PYTHON}`);
});
