-- StudyFlow - MySQL schema
-- Safe: CREATE DATABASE/TABLE IF NOT EXISTS only. No DROP/ALTER.

CREATE DATABASE IF NOT EXISTS studyflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE studyflow;

CREATE TABLE IF NOT EXISTS utilisateur (
 id_utilisateur INT AUTO_INCREMENT PRIMARY KEY,
 nom VARCHAR(100) NOT NULL,
 prenom VARCHAR(100) NOT NULL,
 email VARCHAR(150) NOT NULL UNIQUE,
 mot_de_passe VARCHAR(255) NOT NULL,
 role ENUM('ETUDIANT','ADMIN') NOT NULL DEFAULT 'ETUDIANT',
 date_inscription DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS etablissement (
 id_etablissement INT AUTO_INCREMENT PRIMARY KEY,
 nom VARCHAR(150) NOT NULL,
 adresse VARCHAR(255)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS formation (
 id_formation INT AUTO_INCREMENT PRIMARY KEY,
 nom VARCHAR(150) NOT NULL,
 niveau VARCHAR(100),
 id_etablissement INT NOT NULL,
 FOREIGN KEY (id_etablissement) REFERENCES etablissement(id_etablissement)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS inscription (
 id_inscription INT AUTO_INCREMENT PRIMARY KEY,
 id_utilisateur INT NOT NULL,
 id_formation INT NOT NULL,
 date_inscription DATE NOT NULL,
 FOREIGN KEY (id_utilisateur) REFERENCES utilisateur(id_utilisateur),
 FOREIGN KEY (id_formation) REFERENCES formation(id_formation)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS semestre (
 id_semestre INT AUTO_INCREMENT PRIMARY KEY,
 numero TINYINT NOT NULL,
 annee_academique VARCHAR(9) NOT NULL,
 id_inscription INT NOT NULL,
 FOREIGN KEY (id_inscription) REFERENCES inscription(id_inscription),
 CHECK (numero IN (1,2))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ue (
 id_ue INT AUTO_INCREMENT PRIMARY KEY,
 code_ue VARCHAR(30),
 nom VARCHAR(150) NOT NULL,
 description TEXT,
 credits DECIMAL(5,2),
 volume_horaire DECIMAL(6,2),
 id_semestre INT NOT NULL,
 FOREIGN KEY (id_semestre) REFERENCES semestre(id_semestre)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS evaluation (
 id_evaluation INT AUTO_INCREMENT PRIMARY KEY,
 type VARCHAR(50) NOT NULL,
 date_evaluation DATE NOT NULL,
 coefficient DECIMAL(4,2) NOT NULL DEFAULT 1,
 id_ue INT NOT NULL,
 FOREIGN KEY (id_ue) REFERENCES ue(id_ue)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS resultat (
 id_resultat INT AUTO_INCREMENT PRIMARY KEY,
 note DECIMAL(5,2) NOT NULL,
 id_evaluation INT NOT NULL UNIQUE,
 FOREIGN KEY (id_evaluation) REFERENCES evaluation(id_evaluation),
 CHECK (note >= 0 AND note <= 20)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS objectif (
 id_objectif INT AUTO_INCREMENT PRIMARY KEY,
 titre VARCHAR(150) NOT NULL,
 description TEXT,
 date_debut DATE,
 date_fin DATE,
 statut VARCHAR(50) NOT NULL,
 id_utilisateur INT NOT NULL,
 FOREIGN KEY (id_utilisateur) REFERENCES utilisateur(id_utilisateur)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS session_revision (
 id_session INT AUTO_INCREMENT PRIMARY KEY,
 date_session DATE NOT NULL,
 heure_debut TIME,
 heure_fin TIME,
 duree INT,
 statut VARCHAR(50) NOT NULL,
 id_objectif INT,
 id_ue INT,
 FOREIGN KEY (id_objectif) REFERENCES objectif(id_objectif),
 FOREIGN KEY (id_ue) REFERENCES ue(id_ue)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quiz (
 id_quiz INT AUTO_INCREMENT PRIMARY KEY,
 titre VARCHAR(150) NOT NULL,
 description TEXT,
 difficulte VARCHAR(50),
 date_creation DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 id_ue INT NOT NULL,
 FOREIGN KEY (id_ue) REFERENCES ue(id_ue)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS question (
 id_question INT AUTO_INCREMENT PRIMARY KEY,
 enonce TEXT NOT NULL,
 type VARCHAR(50) NOT NULL,
 reponse_correcte TEXT,
 id_quiz INT NOT NULL,
 FOREIGN KEY (id_quiz) REFERENCES quiz(id_quiz)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tentative_quiz (
 id_tentative INT AUTO_INCREMENT PRIMARY KEY,
 date_tentative DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 score DECIMAL(5,2),
 id_utilisateur INT NOT NULL,
 id_quiz INT NOT NULL,
 FOREIGN KEY (id_utilisateur) REFERENCES utilisateur(id_utilisateur),
 FOREIGN KEY (id_quiz) REFERENCES quiz(id_quiz)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS evenement (
 id_evenement INT AUTO_INCREMENT PRIMARY KEY,
 titre VARCHAR(150) NOT NULL,
 description TEXT,
 date_debut DATETIME NOT NULL,
 date_fin DATETIME,
 lieu VARCHAR(255),
 type VARCHAR(50),
 id_utilisateur INT NOT NULL,
 FOREIGN KEY (id_utilisateur) REFERENCES utilisateur(id_utilisateur)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notification (
 id_notification INT AUTO_INCREMENT PRIMARY KEY,
 titre VARCHAR(150) NOT NULL,
 message TEXT NOT NULL,
 date_envoi DATETIME,
 type VARCHAR(50),
 statut VARCHAR(50),
 id_utilisateur INT NOT NULL,
 FOREIGN KEY (id_utilisateur) REFERENCES utilisateur(id_utilisateur)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS preference_notification (
 id_preference INT AUTO_INCREMENT PRIMARY KEY,
 notifications_application BOOLEAN NOT NULL DEFAULT TRUE,
 notifications_email BOOLEAN NOT NULL DEFAULT FALSE,
 heure_debut TIME,
 heure_fin TIME,
 id_utilisateur INT NOT NULL UNIQUE,
 FOREIGN KEY (id_utilisateur) REFERENCES utilisateur(id_utilisateur)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS budget (
 id_budget INT AUTO_INCREMENT PRIMARY KEY,
 nom VARCHAR(150) NOT NULL,
 montant_initial DECIMAL(12,2) NOT NULL,
 date_debut DATE NOT NULL,
 date_fin DATE,
 id_utilisateur INT NOT NULL,
 FOREIGN KEY (id_utilisateur) REFERENCES utilisateur(id_utilisateur),
 CHECK (montant_initial >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS categorie_depense (
 id_categorie INT AUTO_INCREMENT PRIMARY KEY,
 nom VARCHAR(100) NOT NULL,
 description TEXT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS depense (
 id_depense INT AUTO_INCREMENT PRIMARY KEY,
 montant DECIMAL(12,2) NOT NULL,
 description TEXT,
 date_depense DATE NOT NULL,
 imprevue BOOLEAN NOT NULL DEFAULT FALSE,
 id_budget INT NOT NULL,
 id_categorie INT NOT NULL,
 FOREIGN KEY (id_budget) REFERENCES budget(id_budget),
 FOREIGN KEY (id_categorie) REFERENCES categorie_depense(id_categorie),
 CHECK (montant >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS competence (
 id_competence INT AUTO_INCREMENT PRIMARY KEY,
 nom VARCHAR(150) NOT NULL,
 description TEXT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS utilisateur_competence (
 id_utilisateur INT NOT NULL,
 id_competence INT NOT NULL,
 niveau VARCHAR(50),
 PRIMARY KEY (id_utilisateur,id_competence),
 FOREIGN KEY (id_utilisateur) REFERENCES utilisateur(id_utilisateur),
 FOREIGN KEY (id_competence) REFERENCES competence(id_competence)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS projet (
 id_projet INT AUTO_INCREMENT PRIMARY KEY,
 nom VARCHAR(150) NOT NULL,
 description TEXT,
 date_debut DATE,
 date_fin DATE,
 statut VARCHAR(50)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS utilisateur_projet (
 id_utilisateur INT NOT NULL,
 id_projet INT NOT NULL,
 PRIMARY KEY (id_utilisateur,id_projet),
 FOREIGN KEY (id_utilisateur) REFERENCES utilisateur(id_utilisateur),
 FOREIGN KEY (id_projet) REFERENCES projet(id_projet)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS competence_projet (
 id_competence INT NOT NULL,
 id_projet INT NOT NULL,
 PRIMARY KEY (id_competence,id_projet),
 FOREIGN KEY (id_competence) REFERENCES competence(id_competence),
 FOREIGN KEY (id_projet) REFERENCES projet(id_projet)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS badge (
 id_badge INT AUTO_INCREMENT PRIMARY KEY,
 nom VARCHAR(150) NOT NULL,
 description TEXT,
 condition_obtention TEXT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS utilisateur_badge (
 id_utilisateur INT NOT NULL,
 id_badge INT NOT NULL,
 date_obtention DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (id_utilisateur,id_badge),
 FOREIGN KEY (id_utilisateur) REFERENCES utilisateur(id_utilisateur),
 FOREIGN KEY (id_badge) REFERENCES badge(id_badge)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS opportunite (
 id_opportunite INT AUTO_INCREMENT PRIMARY KEY,
 titre VARCHAR(200) NOT NULL,
 description TEXT,
 type VARCHAR(100),
 organisme VARCHAR(150),
 lien VARCHAR(500),
 date_limite DATE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS competence_opportunite (
 id_competence INT NOT NULL,
 id_opportunite INT NOT NULL,
 PRIMARY KEY (id_competence,id_opportunite),
 FOREIGN KEY (id_competence) REFERENCES competence(id_competence),
 FOREIGN KEY (id_opportunite) REFERENCES opportunite(id_opportunite)
) ENGINE=InnoDB;
