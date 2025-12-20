#!/bin/bash
# Script pour créer la structure des templates DNS

# Créer le répertoire templates
mkdir -p templates

# 1. Template named.conf.options
cat > templates/named.conf.options.j2 << 'EOF'
options {
    directory "/var/cache/bind";

    recursion yes;
    allow-recursion { any; };
    
    listen-on { any; };
    listen-on-v6 { any; };

    forwarders {
{% for forwarder in dns_forwarders %}
        {{ forwarder }};
{% endfor %}
    };

    dnssec-validation auto;
    auth-nxdomain no;
};
EOF

# 2. Template named.conf.local
cat > templates/named.conf.local.j2 << 'EOF'
//
// Zone forward pour {{ dns_domain }}
//
zone "{{ dns_domain }}" {
    type master;
    file "/etc/bind/zones/db.{{ dns_domain }}";
};

//
// Zone reverse
//
zone "{{ dns_reverse_zone }}" {
    type master;
    file "/etc/bind/zones/db.{{ dns_reverse_zone }}";
};
EOF

# 3. Template db.forward
cat > templates/db.forward.j2 << 'EOF'
;
; Zone file for {{ dns_domain }}
;
$TTL    604800
@       IN      SOA     dns1.{{ dns_domain }}. admin.{{ dns_domain }}. (
                              2         ; Serial
                         604800         ; Refresh
                          86400         ; Retry
                        2419200         ; Expire
                         604800 )       ; Negative Cache TTL
;
; Name servers
@       IN      NS      dns1.{{ dns_domain }}.

; A records
{% for record in dns_records %}
{{ record.name }}    IN      {{ record.type }}    {{ record.ip }}
{% endfor %}
EOF

# 4. Template db.reverse
cat > templates/db.reverse.j2 << 'EOF'
;
; Reverse zone file for {{ dns_network }}.0/24
;
$TTL    604800
@       IN      SOA     dns1.{{ dns_domain }}. admin.{{ dns_domain }}. (
                              2         ; Serial
                         604800         ; Refresh
                          86400         ; Retry
                        2419200         ; Expire
                         604800 )       ; Negative Cache TTL
;
; Name servers
@       IN      NS      dns1.{{ dns_domain }}.

; PTR records
{% for record in dns_records %}
{{ record.ip.split('.')[-1] }}    IN      PTR     {{ record.name }}.{{ dns_domain }}.
{% endfor %}
EOF

# 5. Template resolv.conf pour les clients
cat > templates/resolv.conf.j2 << 'EOF'
# Configuration DNS par Ansible
nameserver {{ dns_server_ip }}
{% for domain in dns_search_domains %}
search {{ domain }}
{% endfor %}
EOF

# 6. Template resolved.conf
cat > templates/resolved.conf.j2 << 'EOF'
[Resolve]
DNS={{ dns_server_ip }}
Domains={{ dns_search_domains | join(' ') }}
EOF

echo "Templates créés avec succès dans le dossier templates/"
