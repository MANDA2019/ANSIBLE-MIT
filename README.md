# ANSIBLE-MIT

**Automatisation réseau MIT** - DNS, SSH, TLS pour Madagascar Institut de Technologie.

[![GitHub stars](https://img.shields.io/github/stars/MANDA2019/ANSIBLE-MIT)](https://github.com/MANDA2019/ANSIBLE-MIT)

## ⚙️ Comment ça marche ?

Inventaire → Playbook → Roles (DNS/SSH/TLS) → Serveurs MIT

text

## EXEMPLES

### 1️⃣ **DNS BIND9** - `roles/mit-dns`

**Inventaire** `inventory/prod.yml`:
dns_servers:
hosts:
dns01.mit.mg:
ansible_host: 192.168.1.20

text

**Playbook** `playbooks/dns.yml`:
name: Déployer DNS MIT
hosts: dns_servers
become: yes
roles:

mit-dns

text

**Role** `roles/mit-dns/tasks/main.yml`:
name: Installer Bind9
apt: name=bind9 state=present

name: Configurer zone MIT
template:
src: db.mit.mg.j2
dest: /etc/bind/db.mit.mg
notify: restart bind9

name: Activer service
service: name=bind9 state=started enabled=yes

**Template** `roles/mit-dns/templates/db.mit.mg.j2`:
$TTL 3600
@ IN SOA dns01.mit.mg. root.mit.mg. (
202512191 ; Serial
3600 ; Refresh
1800 ; Retry
604800 ; Expire
3600 ) ; Minimum
@ IN NS dns01.mit.mg.
dns01 IN A {{ ansible_host }}
web01 IN A 192.168.1.10
git IN A 192.168.1.15

**Test**: `nslookup web01.mit.mg dns01.mit.mg` → `192.168.1.10`

---

### **SSH Hardening** - `roles/mit-ssh`

**Playbook** `playbooks/ssh.yml`:
name: Sécuriser SSH MIT
hosts: all
become: yes
roles:

mit-ssh

**Role** `roles/mit-ssh/tasks/main.yml`:
name: Installer clés SSH
authorized_key:
user: "{{ ansible_user }}"
key: "{{ lookup('file', 'files/manda.pub') }}"

name: Configurer SSHD
lineinfile:
path: /etc/ssh/sshd_config
regexp: '^#?{{ item.regexp }}'
line: "{{ item.line }}"
loop:

{ regexp: 'PermitRootLogin', line: 'PermitRootLogin no' }

{ regexp: 'PasswordAuthentication', line: 'PasswordAuthentication no' }

{ regexp: 'Port', line: 'Port {{ ssh_port | default(22) }}' }
notify: restart ssh

name: Désactiver login root
user: name=root shell=/bin/false

text

**Résultat**:
ssh manda@web01.mit.mg -p 22 # Clé SSH only
ssh root@web01.mit.mg #  Refusé

text

---

### 3️⃣ **TLS/SSL** - `roles/mit-tls`

**Playbook** `playbooks/tls.yml`:
name: Déployer certificats MIT
hosts: webservers
become: yes
roles:

mit-tls

text

**Role** `roles/mit-tls/tasks/main.yml`:
name: Installer Certbot
apt: name=certbot state=present

name: Créer certificat wildcard
shell: certbot certonly --standalone -d *.mit.mg --email manda@mit.mg --agree-tos --non-interactive
when: tls_auto_renew | default(false)

name: Copier certificats Nginx
copy:
src: "{{ item.src }}"
dest: "{{ item.dest }}"
owner: www-data
group: www-data
loop:

{ src: '/etc/letsencrypt/live/mit.mg/fullchain.pem', dest: '/etc/nginx/ssl/mit.mg.crt' }

{ src: '/etc/letsencrypt/live/mit.mg/privkey.pem', dest: '/etc/nginx/ssl/mit.mg.key' }

name: Configurer Nginx HTTPS
template: src=nginx-https.conf.j2 dest=/etc/nginx/sites-available/mit.mg
notify: restart nginx

text

**Template Nginx** `nginx-https.conf.j2`:
server {
listen 443 ssl http2;
server_name {{ ansible_fqdn }};
ssl_certificate /etc/nginx/ssl/mit.mg.crt;
ssl_certificate_key /etc/nginx/ssl/mit.mg.key;

... config MIT
}

text

**Test**: `curl -I https://web01.mit.mg` → `HTTP/2 200`

---

## **DÉPLOIEMENT COMPLET **

1. Tout en une fois
ansible-playbook -i inventory/prod.yml site.yml

2. Ou par étapes
ansible-playbook playbooks/dns.yml # DNS d'abord
ansible-playbook playbooks/ssh.yml # Sécuriser accès
ansible-playbook playbooks/tls.yml # HTTPS final

text

**site.yml** (orchestration):
import_playbook: playbooks/dns.yml

import_playbook: playbooks/ssh.yml

import_playbook: playbooks/tls.yml

text

## Installation
git clone https://github.com/MANDA2019/ANSIBLE-MIT.git
cd ANSIBLE-MIT
ansible-playbook site.yml -i inventory/prod.yml


**Automatisation réseau MIT** - 3 rôles essentiels.

## **QUE FONT CES 3 RÔLES ?**

### 1️1-**mit-dns** (DNS BIND9)
**Crée un serveur DNS** pour `mit.mg`  
- Installe Bind9  
- Zone `mit.mg` avec `web01.mit.mg → 192.168.1.10`  
- `nslookup web01.mit.mg` 

### 2- **mit-ssh** (Sécurité SSH)  
**Sécurise l'accès distant**  
- Clés SSH only (no mot de passe)  
- Root login bloqué  
- `ssh manda@web01.mit.mg` → Clé OK  

### 3️3-**mit-tls** (HTTPS/SSL)  
**Active HTTPS sur web**  
- Certificats wildcard `*.mit.mg`  
- Nginx HTTPS configuré  
- `https://web01.mit.mg` → SSL vert

---
*Automatisation complète DNS+SSH+TLS pour MIT 2025*
