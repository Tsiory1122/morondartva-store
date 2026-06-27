# Morondartva-Store

Une plateforme web moderne, vitrine et commerciale pour la maison de production audiovisuelle **Morondartva**. Elle réunit la diffusion en streaming de vidéos exclusives (films, courts-métrages, channels) et la vente de produits dérivés (t-shirts, casquettes, etc.) sur un serveur local développé en **Python pur (sans framework)** avec **SQLite** et du **JavaScript natif (Vanilla)**.

---

## 1. Fonctionnalités Principales

*   **Page d'Accueil Dynamique** : Bannière immersive (utilisant `acceuil.png`), carrousel des dernières vidéos et des produits les plus vendus.
*   **Boutique E-Commerce** : Catalogue avec filtres de catégories (Vêtements, Accessoires), recherche en temps réel, panier interactif (slide-out drawer) et tunnel de commande simple.
*   **Espace Vidéo (Streaming)** : Hub de lecture vidéo classé par catégories. Intègre un système de verrouillage pour le contenu exclusif (accès premium global ou achat individuel de vidéo).
*   **Espace Client** : Tableau de bord utilisateur pour mettre à jour ses informations de profil, simuler l'achat d'un abonnement Premium, suivre ses commandes physiques et accéder à ses vidéos achetées.
*   **Back-Office Administrateur** :
    *   Statistiques globales de vente, utilisateurs inscrits, vidéos favorites et classements.
    *   Gestion CRUD des produits (avec upload d'image convertie en Base64).
    *   Gestion CRUD des vidéos (avec upload d'affiche miniature et liens de lecture MP4/YouTube/Vimeo).
    *   Gestion des comptes clients (changement de rôle, mise à jour du statut premium, bannissement).
*   **Support & Contact** : Formulaire interactif et bulle de discussion flottante (liens directs vers WhatsApp, Telegram et E-mail).

---

## 2. Structure du Projet

```text
morondava store/
├── server/
│   ├── main.py                 # Serveur HTTP et routage statique
│   ├── routes.py               # Contrôleur d'API REST (décode JSON/Base64, requêtes SQL)
│   ├── database.py             # Schémas et requêtes SQLite (seeding automatique de départ)
│   ├── auth.py                 # Session manager en mémoire (jetons UUID)
│   └── payment.py              # Interface d'intégration de paiements locaux et internationaux
│
├── client/
│   ├── index.html              # Vue principale de l'application (Single Page)
│   ├── css/
│   │   └── styles.css          # Design et animations (Palette: Noir, rouge, blanc, gris sombre)
│   └── js/
│       ├── api.js              # Client d'appels Fetch vers le backend
│       ├── auth.js             # Gestionnaire d'authentification client
│       ├── shop.js             # Gestionnaire de panier et tunnel d'achat
│       ├── video.js            # Galerie de lecture et verrouillage de vidéos
│       ├── admin.js            # Tableau de bord back-office
│       └── app.js              # Routeur d'URL hash et contrôleur général
│
├── uploads/                    # Dossier créé automatiquement pour les images/vidéos
│   ├── products/
│   └── videos/
│
├── database.db                 # Fichier de base de données SQLite (créé au premier lancement)
└── README.md                   # Ce document de documentation
```

---

## 3. Identifiants de Test

Lors de l'initialisation automatique, la base de données crée un compte administrateur par défaut :
*   **Email** : `admin@morondartva.com`
*   **Mot de passe** : `admin`

Vous pouvez également créer de nouveaux comptes utilisateurs directement depuis le bouton **Connexion -> Créer un compte** sur le site.

---

## 4. Lancement Local

Pour démarrer l'application, ouvrez votre terminal dans le dossier racine du projet et exécutez la commande suivante :

```bash
python3 server/main.py
```

Le serveur démarrera sur le port **8000** :
*   **Lien local** : [http://localhost:8000](http://localhost:8000)

*Note : Au premier lancement, la base de données `database.db` est automatiquement générée et configurée avec des données de démonstration (produits phares et bandes-annonces de vidéos).*

---

## 5. Comment étendre les API de Paiement ?

Le fichier [server/payment.py](file:///home/maminatolotra/Desktop/morondava%20store/server/payment.py) a été spécialement conçu pour héberger les appels aux passerelles de paiement.

Pour chaque méthode (Mvola, Orange Money, Airtel Money, PayPal, Visa), vous trouverez une fonction dédiée (ex: `initiate_mvola_payment`) avec des exemples d'appels de requêtes `urllib.request`. Il vous suffira de remplacer les simulations de réussite par les clés API de votre compte marchand.
