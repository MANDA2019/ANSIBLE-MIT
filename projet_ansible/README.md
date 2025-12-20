# 🚀 Projet Ansible - Automatisation de l'Infrastructure

Ce projet permet d'automatiser la gestion de plusieurs serveurs Linux avec une interface web.

## 📋 Fonctionnalités

| Fonctionnalité               | Description                                         |
| ---------------------------- | --------------------------------------------------- |
| 🔄 **Mise à jour système**   | Met à jour tous les paquets (apt update/upgrade)    |
| 🧹 **Nettoyage automatique** | Supprime les fichiers temporaires et anciens logs   |
| 🌐 **Configuration réseau**  | Configure automatiquement les adresses IP statiques |
| 🗄️ **Installation MariaDB**  | Installe et sécurise MariaDB                        |
| 📊 **Création de BDD**       | Crée automatiquement les bases de données           |
| 🖥️ **Interface Web**         | Gère tout via une interface graphique               |

---

## 📁 Structure du Projet

```
projet_ansible/
├── ansible.cfg          # Configuration Ansible
├── hosts                # Inventaire des serveurs
├── site.yml             # Playbook principal
├── secret.yml           # Mots de passe (à chiffrer!)
├── group_vars/
│   └── remote.yml       # Variables pour tous les hôtes
├── host_vars/
│   ├── pc1.yml          # Variables spécifiques à PC1
│   └── pc2.yml          # Variables spécifiques à PC2
├── roles/
│   ├── update.yml       # Rôle: Mise à jour système
│   ├── cleanup.yml      # Rôle: Nettoyage
│   ├── network.yml      # Rôle: Configuration réseau
│   └── mariadb.yml      # Rôle: Installation MariaDB
└── webapp/
    ├── app.py           # Application Flask
    ├── requirements.txt # Dépendances Python
    └── templates/       # Templates HTML
```

---

## 🛠️ Installation

### 1. Prérequis

```bash
# Sur le serveur de contrôle (votre PC)
sudo apt update
sudo apt install ansible python3-pip -y
```

### 2. Configurer les clés SSH

```bash
# Générer une clé SSH (si pas déjà fait)
ssh-keygen -t rsa -b 4096

# Copier la clé vers chaque serveur distant
ssh-copy-id manda@192.168.1.21
ssh-copy-id mimi@192.168.1.22
```

### 3. Tester la connexion

```bash
cd /home/maharavo/L2/projet_ansible
ansible all -m ping
```

---

## 🎯 Utilisation

### Option 1: Ligne de commande

```bash
# Exécuter TOUT (mise à jour + nettoyage + réseau + MariaDB)
ansible-playbook site.yml

# Mise à jour uniquement
ansible-playbook site.yml --tags update

# Nettoyage uniquement
ansible-playbook site.yml --tags cleanup

# Configuration réseau uniquement
ansible-playbook site.yml --tags network

# Installation MariaDB uniquement
ansible-playbook site.yml --tags mariadb

# Sur un seul hôte
ansible-playbook site.yml --limit pc1

# Sur un seul hôte avec une tâche spécifique
ansible-playbook site.yml --tags update --limit pc1
```

### Option 2: Interface Web 🌐

```bash
# Installer les dépendances
cd webapp
pip3 install -r requirements.txt

# Lancer l'interface web
python3 app.py

# Ouvrir dans le navigateur: http://localhost:5000
```

---

## 📝 Configuration Détaillée

### Fichier `hosts` (Inventaire)

```ini
[remote]
pc1 ansible_host=192.168.1.21 ansible_user=manda
pc2 ansible_host=192.168.1.22 ansible_user=mimi
router1 ansible_host=192.168.1.1 ansible_user=admin
```

**Explication:**

- `[remote]` : Nom du groupe de serveurs
- `pc1` : Alias du serveur
- `ansible_host` : Adresse IP du serveur
- `ansible_user` : Utilisateur SSH pour se connecter

### Fichier `host_vars/pc1.yml`

```yaml
# Configuration réseau
interface_name: 'ens33' # Interface réseau
new_ip: '192.168.1.21' # IP à configurer
gateway: '192.168.1.1' # Passerelle
dns: '8.8.8.8' # Serveur DNS

# Options
configure_network: true # Activer la config réseau
install_mariadb: true # Installer MariaDB

# Bases de données à créer
databases:
  - name: production_db
  - name: development_db
```

### Fichier `secret.yml` (Sécurité)

⚠️ **Important:** Chiffrez ce fichier avec Ansible Vault!

```bash
# Chiffrer le fichier
ansible-vault encrypt secret.yml

# Exécuter avec le fichier chiffré
ansible-playbook site.yml --ask-vault-pass
```

---

## 📚 Explications des Rôles

### 1. 🔄 Rôle `update.yml` - Mise à jour système

Ce rôle effectue:

- `apt update` : Met à jour la liste des paquets
- `apt upgrade` : Installe les mises à jour
- `autoremove` : Supprime les paquets orphelins

### 2. 🧹 Rôle `cleanup.yml` - Nettoyage

Ce rôle effectue:

- Suppression des fichiers dans `/tmp` (plus de 7 jours)
- Suppression des fichiers dans `/var/tmp`
- Rotation des journaux système (`journalctl --vacuum-time=7d`)
- Suppression des anciens fichiers `.gz` et `.1` dans `/var/log`
- Nettoyage du cache APT

### 3. 🌐 Rôle `network.yml` - Configuration IP

Ce rôle effectue:

- Sauvegarde de la config actuelle
- Création d'un fichier Netplan avec l'IP statique
- Application de la configuration (`netplan apply`)

### 4. 🗄️ Rôle `mariadb.yml` - Base de données

Ce rôle effectue:

- Installation de MariaDB Server et Client
- Démarrage et activation du service
- Sécurisation (suppression utilisateurs anonymes, base test)
- Création des bases de données définies
- Création des utilisateurs avec leurs privilèges

---

## 🖥️ Interface Web

L'interface web permet de:

| Fonctionnalité           | Description                                       |
| ------------------------ | ------------------------------------------------- |
| **Dashboard**            | Vue d'ensemble, statistiques, actions rapides     |
| **Gestion des hôtes**    | Voir, modifier la configuration de chaque serveur |
| **Exécution des tâches** | Lancer les playbooks en un clic                   |
| **Logs**                 | Voir l'historique des exécutions                  |
| **API REST**             | Intégration avec d'autres outils                  |

### Captures d'écran

L'interface comprend:

- Un menu latéral pour la navigation
- Des boutons colorés pour chaque action
- Un sélecteur pour cibler un ou plusieurs hôtes
- Des logs en temps réel

---

## 🔒 Sécurité

1. **Chiffrez les secrets:**

   ```bash
   ansible-vault encrypt secret.yml
   ```

2. **Utilisez des clés SSH** plutôt que des mots de passe

3. **Limitez les accès** au répertoire du projet

4. **Changez les mots de passe** par défaut dans `secret.yml`

---

## 🆘 Dépannage

### Erreur de connexion SSH

```bash
# Vérifier la connectivité
ansible all -m ping -vvv

# Vérifier les clés SSH
ssh-add -l
```

### Erreur de privilèges

```bash
# Ajouter --ask-become-pass
ansible-playbook site.yml --ask-become-pass
```

### Erreur de syntaxe

```bash
# Vérifier la syntaxe
ansible-playbook site.yml --syntax-check
```

---

## 📞 Support

Pour toute question, créez une issue ou contactez l'administrateur.

---

**Créé le:** Décembre 2024  
**Auteur:** Maharavo  
**Version:** 1.0
