# Récapitulatif — Session opencode (30/06/2026)

## Objectif
Préparer le projet **Morondartva Store** pour un déploiement sur **hodi.host** :
- Mettre en place Git + pousser sur GitHub
- Ajouter une couche PostgreSQL pour la production
- Créer la configuration nécessaire

## Travail effectué

### 1. Git — Commit + Push
- Commit des modifications en cours (13 fichiers)
- Création du dépôt GitHub : `github.com/Tsiory1122/morondartva-store`
- Push de la branche `main`
- Remote : `git@github.com:Tsiory1122/morondartva-store.git`

### 2. PostgreSQL — Couche d'abstraction
- **`server/db.py`** (nouveau) : Gère automatiquement SQLite (dev) et PostgreSQL (prod)
  - Détecté via `DB_TYPE` (sqlite | postgresql)
  - PostgreSQL via `DATABASE_URL`
  - Convertit automatiquement `?` → `%s`, `INSERT OR REPLACE` → `ON CONFLICT DO UPDATE`
  - Gère `lastrowid` pour les INSERT
  - Supporte aussi bien `conn.execute()` que `conn.cursor().execute()`
- **`server/database.py`** modifié : Schema compatible PostgreSQL (`SERIAL PRIMARY KEY`, etc.)
- **`server/main.py`** modifié : Port/Host lis depuis les variables d'environnement

### 3. Fichiers créés/modifiés
```
Créés :
  server/db.py              — Abstraction base de données
  requirements.txt          — Dépendances (psycopg2-binary)
  .env.example              — Exemple de configuration
  RECAP.md                  — Ce fichier

Modifiés :
  server/database.py        — Schema compatible PG
  server/main.py            — Configuration via env vars
  .gitignore                — Ajout de .env
```

## Instructions de déploiement sur hodi.host

### Prérequis
- Un VPS ou hébergement Site Pro chez hodi.host
- Python 3.10+
- PostgreSQL (fourni par hodi.host)

### Étapes

```bash
# 1. Cloner le dépôt
git clone https://github.com/Tsiory1122/morondartva-store.git
cd morondartva-store

# 2. Installer les dépendances
pip install -r requirements.txt

# 3. Configurer les variables d'environnement
export DB_TYPE=postgresql
export DATABASE_URL="postgresql://user:password@hote:5432/nomdb"
export PORT=8000

# 4. Lancer le serveur
python3 server/main.py
```

### Pour un déploiement permanent (systemd)
Créer un fichier `/etc/systemd/system/morondartva.service` :

```ini
[Unit]
Description=Morondartva Store
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/chemin/vers/morondartva-store
Environment=DB_TYPE=postgresql
Environment=DATABASE_URL=postgresql://user:password@hote:5432/nomdb
Environment=PORT=8000
ExecStart=/usr/bin/python3 /chemin/vers/morondartva-store/server/main.py
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now morondartva
```

## Utilisation en local
Par défaut (sans variables d'env), le mode SQLite est actif :
```bash
python3 server/main.py
# http://localhost:8000
```

Pour tester PostgreSQL en local :
```bash
export DB_TYPE=postgresql
export DATABASE_URL="postgresql://localhost/morondartva"
python3 server/main.py
```

## Identifiants de test
- **Admin** : admin@morondartva.com / admin
- **Scanner** : scanner@morondartva.com / scanner
