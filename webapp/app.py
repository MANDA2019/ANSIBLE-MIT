from flask import Flask, render_template, request, jsonify
import subprocess
import json
import os
from datetime import datetime

app = Flask(__name__)

# Chemin du projet Ansible
ANSIBLE_DIR = os.path.abspath('..')
INVENTORY_FILE = os.path.join(ANSIBLE_DIR, 'hosts')

def get_hosts():
    """Récupérer la liste des hôtes"""
    try:
        result = subprocess.run(
            ['ansible', 'all', '--list-hosts', '-i', INVENTORY_FILE],
            capture_output=True,
            text=True,
            cwd=ANSIBLE_DIR
        )
        hosts = [line.strip() for line in result.stdout.split('\n') 
                if line.strip() and 'hosts' not in line]
        return hosts if hosts else ['localhost']
    except:
        return ['localhost']

@app.route('/')
def index():
    """Page d'accueil"""
    hosts = get_hosts()
    return render_template('index.html', hosts=hosts, history=[])

@app.route('/execute')
def execute_page():
    """Page d'exécution"""
    hosts = get_hosts()
    return render_template('execute.html', hosts=hosts)

@app.route('/hosts')
def hosts_page():
    """Page des hôtes"""
    hosts = get_hosts()
    return render_template('hosts.html', hosts=hosts)

@app.route('/api/execute', methods=['POST'])
def api_execute():
    """API pour exécuter un playbook"""
    data = request.json
    action = data.get('action')
    hosts = data.get('hosts', 'all')
    
    # Mapping des actions vers les playbooks
    playbook_map = {
        'update': ('site.yml', 'update'),
        'cleanup': ('site.yml', 'cleanup'),
        'network': ('playbooks/network.yml', None),
        'mariadb': ('playbooks/database.yml', None),
        'dns': ('playbooks/dns.yml', None),
        'ssh': ('playbooks/ssh.yml', None),
        'tls': ('playbooks/tls.yml', None),
        'system': ('playbooks/system.yml', None),
    }
    
    if action not in playbook_map:
        return jsonify({
            'success': False,
            'output': '',
            'error': f'Action inconnue: {action}'
        })
    
    playbook, tags = playbook_map[action]
    playbook_path = os.path.join(ANSIBLE_DIR, playbook)
    
    # Construire la commande
    cmd = ['ansible-playbook', playbook, '-i', INVENTORY_FILE]
    
    if hosts != 'all':
        cmd.extend(['--limit', hosts])
    
    if tags:
        cmd.extend(['--tags', tags])
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=ANSIBLE_DIR,
            timeout=300
        )
        
        return jsonify({
            'success': result.returncode == 0,
            'output': result.stdout,
            'error': result.stderr
        })
    except subprocess.TimeoutExpired:
        return jsonify({
            'success': False,
            'output': '',
            'error': 'Timeout: La commande a pris trop de temps'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'output': '',
            'error': str(e)
        })

@app.route('/api/ping', methods=['POST'])
def api_ping():
    """Tester la connexion"""
    data = request.json
    hosts = data.get('hosts', 'all')
    
    try:
        result = subprocess.run(
            ['ansible', hosts, '-m', 'ping', '-i', INVENTORY_FILE],
            capture_output=True,
            text=True,
            cwd=ANSIBLE_DIR,
            timeout=30
        )
        
        return jsonify({
            'success': result.returncode == 0,
            'output': result.stdout,
            'error': result.stderr
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'output': '',
            'error': str(e)
        })

@app.route('/api/stats')
def api_stats():
    """Statistiques"""
    return jsonify({
        'total': 0,
        'success': 0,
        'failed': 0,
        'actions': {},
        'last_execution': None
    })

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 Interface Web Ansible MIT")
    print("=" * 60)
    print("📡 Serveur démarré sur:")
    print("   • http://localhost:5000")
    print("   • http://127.0.0.1:5000")
    print("   • http://192.168.1.100:5000")
    print("   • http://192.168.88.118:5000")
    print("=" * 60)
    print("🛑 Appuyez sur Ctrl+C pour arrêter")
    print("=" * 60)
    print()
    
    app.run(debug=True, host='0.0.0.0', port=5000)


