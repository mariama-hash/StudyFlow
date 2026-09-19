-- StudyFlow - schéma PostgreSQL
-- Safe: CREATE TABLE IF NOT EXISTS uniquement. Pas de DROP/ALTER.
--
-- Contrairement à MySQL, PostgreSQL ne permet pas de créer une base de données
-- (CREATE DATABASE) ni de basculer dessus (USE) depuis un script exécuté avec psql -f
-- à l'intérieur d'une transaction. Créez la base une fois en amont, par exemple :
--   createdb studyflow
-- ou, depuis psql :
--   CREATE DATABASE studyflow;
--   \c studyflow
-- puis exécutez le reste de ce script connecté à cette base.

CREATE TABLE IF NOT EXISTS utilisateur (
 id_utilisateur SERIAL PRIMARY KEY,
 nom VARCHAR(100) NOT NULL,
 prenom VARCHAR(100) NOT NULL,
 email VARCHAR(150) NOT NULL UNIQUE,
 mot_de_passe VARCHAR(255) NOT NULL,
 role VARCHAR(20) NOT NULL DEFAULT 'ETUDIANT' CHECK (role IN ('ETUDIANT','ADMIN')),
 date_inscription TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS etablissement (
 id_etablissement SERIAL PRIMARY KEY,
 nom VARCHAR(150) NOT NULL,
 adresse VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS formation (
 id_formation SERIAL PRIMARY KEY,
 nom VARCHAR(150) NOT NULL,
 niveau VARCHAR(100),
 id_etablissement INT NOT NULL,
 FOREIGN KEY (id_etablissement) REFERENCES etablissement(id_etablissement)
);

CREATE TABLE IF NOT EXISTS inscription (
 id_inscription SERIAL PRIMARY KEY,
 id_utilisateur INT NOT NULL,
 id_formation INT NOT NULL,
 date_inscription DATE NOT NULL,
 FOREIGN KEY (id_utilisateur) REFERENCES utilisateur(id_utilisateur),
 FOREIGN KEY (id_formation) REFERENCES formation(id_formation)
);

CREATE TABLE IF NOT EXISTS semestre (
 id_semestre SERIAL PRIMARY KEY,
 numero SMALLINT NOT NULL,
 annee_academique VARCHAR(9) NOT NULL,
 id_inscription INT NOT NULL,
 FOREIGN KEY (id_inscription) REFERENCES inscription(id_inscription),
 CHECK (numero IN (1,2))
);

CREATE TABLE IF NOT EXISTS ue (
 id_ue SERIAL PRIMARY KEY,
 code_ue VARCHAR(30),
 nom VARCHAR(150) NOT NULL,
 description TEXT,
 credits DECIMAL(5,2),
 volume_horaire DECIMAL(6,2),
 id_semestre INT NOT NULL,
 FOREIGN KEY (id_semestre) REFERENCES semestre(id_semestre)
);

CREATE TABLE IF NOT EXISTS evaluation (
 id_evaluation SERIAL PRIMARY KEY,
 type VARCHAR(50) NOT NULL,
 date_evaluation DATE NOT NULL,
 coefficient DECIMAL(4,2) NOT NULL DEFAULT 1,
 id_ue INT NOT NULL,
 FOREIGN KEY (id_ue) REFERENCES ue(id_ue)
);

CREATE TABLE IF NOT EXISTS resultat (
 id_resultat SERIAL PRIMARY KEY,
 note DECIMAL(5,2) NOT NULL,
 id_evaluation INT NOT NULL UNIQUE,
 FOREIGN KEY (id_evaluation) REFERENCES evaluation(id_evaluation),
 CHECK (note >= 0 AND note <= 20)
);

CREATE TABLE IF NOT EXISTS objectif (
 id_objectif SERIAL PRIMARY KEY,
 titre VARCHAR(150) NOT NULL,
 description TEXT,
 date_debut DATE,
 date_fin DATE,
 statut VARCHAR(50) NOT NULL,
 id_utilisateur INT NOT NULL,
 FOREIGN KEY (id_utilisateur) REFERENCES utilisateur(id_utilisateur)
);

CREATE TABLE IF NOT EXISTS session_revision (
 id_session SERIAL PRIMARY KEY,
 date_session DATE NOT NULL,
 heure_debut TIME,
 heure_fin TIME,
 duree INT,
 statut VARCHAR(50) NOT NULL,
 id_objectif INT,
 id_ue INT,
 FOREIGN KEY (id_objectif) REFERENCES objectif(id_objectif),
 FOREIGN KEY (id_ue) REFERENCES ue(id_ue)
);

CREATE TABLE IF NOT EXISTS quiz (
 id_quiz SERIAL PRIMARY KEY,
 titre VARCHAR(150) NOT NULL,
 description TEXT,
 difficulte VARCHAR(50),
 date_creation TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 id_ue INT NOT NULL,
 FOREIGN KEY (id_ue) REFERENCES ue(id_ue)
);

CREATE TABLE IF NOT EXISTS question (
 id_question SERIAL PRIMARY KEY,
 enonce TEXT NOT NULL,
 type VARCHAR(50) NOT NULL,
 reponse_correcte TEXT,
 id_quiz INT NOT NULL,
 FOREIGN KEY (id_quiz) REFERENCES quiz(id_quiz)
);

CREATE TABLE IF NOT EXISTS tentative_quiz (
 id_tentative SERIAL PRIMARY KEY,
 date_tentative TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 score DECIMAL(5,2),
 id_utilisateur INT NOT NULL,
 id_quiz INT NOT NULL,
 FOREIGN KEY (id_utilisateur) REFERENCES utilisateur(id_utilisateur),
 FOREIGN KEY (id_quiz) REFERENCES quiz(id_quiz)
);

CREATE TABLE IF NOT EXISTS evenement (
 id_evenement SERIAL PRIMARY KEY,
 titre VARCHAR(150) NOT NULL,
 description TEXT,
 date_debut TIMESTAMP NOT NULL,
 date_fin TIMESTAMP,
 lieu VARCHAR(255),
 type VARCHAR(50),
 id_utilisateur INT NOT NULL,
 FOREIGN KEY (id_utilisateur) REFERENCES utilisateur(id_utilisateur)
);

CREATE TABLE IF NOT EXISTS notification (
 id_notification SERIAL PRIMARY KEY,
 titre VARCHAR(150) NOT NULL,
 message TEXT NOT NULL,
 date_envoi TIMESTAMP,
 type VARCHAR(50),
 statut VARCHAR(50),
 id_utilisateur INT NOT NULL,
 FOREIGN KEY (id_utilisateur) REFERENCES utilisateur(id_utilisateur)
);

CREATE TABLE IF NOT EXISTS preference_notification (
 id_preference SERIAL PRIMARY KEY,
 notifications_application BOOLEAN NOT NULL DEFAULT TRUE,
 notifications_email BOOLEAN NOT NULL DEFAULT FALSE,
 heure_debut TIME,
 heure_fin TIME,
 id_utilisateur INT NOT NULL UNIQUE,
 FOREIGN KEY (id_utilisateur) REFERENCES utilisateur(id_utilisateur)
);

CREATE TABLE IF NOT EXISTS budget (
 id_budget SERIAL PRIMARY KEY,
 nom VARCHAR(150) NOT NULL,
 montant_initial DECIMAL(12,2) NOT NULL,
 date_debut DATE NOT NULL,
 date_fin DATE,
 id_utilisateur INT NOT NULL,
 FOREIGN KEY (id_utilisateur) REFERENCES utilisateur(id_utilisateur),
 CHECK (montant_initial >= 0)
);

CREATE TABLE IF NOT EXISTS categorie_depense (
 id_categorie SERIAL PRIMARY KEY,
 nom VARCHAR(100) NOT NULL,
 description TEXT
);

CREATE TABLE IF NOT EXISTS depense (
 id_depense SERIAL PRIMARY KEY,
 montant DECIMAL(12,2) NOT NULL,
 description TEXT,
 date_depense DATE NOT NULL,
 imprevue BOOLEAN NOT NULL DEFAULT FALSE,
 id_budget INT NOT NULL,
 id_categorie INT NOT NULL,
 FOREIGN KEY (id_budget) REFERENCES budget(id_budget),
 FOREIGN KEY (id_categorie) REFERENCES categorie_depense(id_categorie),
 CHECK (montant >= 0)
);

CREATE TABLE IF NOT EXISTS competence (
 id_competence SERIAL PRIMARY KEY,
 nom VARCHAR(150) NOT NULL,
 description TEXT
);

CREATE TABLE IF NOT EXISTS utilisateur_competence (
 id_utilisateur INT NOT NULL,
 id_competence INT NOT NULL,
 niveau VARCHAR(50),
 PRIMARY KEY (id_utilisateur,id_competence),
 FOREIGN KEY (id_utilisateur) REFERENCES utilisateur(id_utilisateur),
 FOREIGN KEY (id_competence) REFERENCES competence(id_competence)
);

CREATE TABLE IF NOT EXISTS projet (
 id_projet SERIAL PRIMARY KEY,
 nom VARCHAR(150) NOT NULL,
 description TEXT,
 date_debut DATE,
 date_fin DATE,
 statut VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS utilisateur_projet (
 id_utilisateur INT NOT NULL,
 id_projet INT NOT NULL,
 PRIMARY KEY (id_utilisateur,id_projet),
 FOREIGN KEY (id_utilisateur) REFERENCES utilisateur(id_utilisateur),
 FOREIGN KEY (id_projet) REFERENCES projet(id_projet)
);

CREATE TABLE IF NOT EXISTS competence_projet (
 id_competence INT NOT NULL,
 id_projet INT NOT NULL,
 PRIMARY KEY (id_competence,id_projet),
 FOREIGN KEY (id_competence) REFERENCES competence(id_competence),
 FOREIGN KEY (id_projet) REFERENCES projet(id_projet)
);

CREATE TABLE IF NOT EXISTS badge (
 id_badge SERIAL PRIMARY KEY,
 nom VARCHAR(150) NOT NULL,
 description TEXT,
 condition_obtention TEXT
);

CREATE TABLE IF NOT EXISTS utilisateur_badge (
 id_utilisateur INT NOT NULL,
 id_badge INT NOT NULL,
 date_obtention TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (id_utilisateur,id_badge),
 FOREIGN KEY (id_utilisateur) REFERENCES utilisateur(id_utilisateur),
 FOREIGN KEY (id_badge) REFERENCES badge(id_badge)
);

CREATE TABLE IF NOT EXISTS opportunite (
 id_opportunite SERIAL PRIMARY KEY,
 titre VARCHAR(200) NOT NULL,
 description TEXT,
 type VARCHAR(100),
 organisme VARCHAR(150),
 lien VARCHAR(500),
 date_limite DATE
);

CREATE TABLE IF NOT EXISTS competence_opportunite (
 id_competence INT NOT NULL,
 id_opportunite INT NOT NULL,
 PRIMARY KEY (id_competence,id_opportunite),
 FOREIGN KEY (id_competence) REFERENCES competence(id_competence),
 FOREIGN KEY (id_opportunite) REFERENCES opportunite(id_opportunite)
);
