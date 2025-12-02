export interface PageTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  content: any;
}

export const pageTemplates: PageTemplate[] = [
  {
    id: "blank",
    name: "Page vierge",
    description: "Commencer avec une page vide",
    icon: "📄",
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { textAlign: null },
        },
      ],
    },
  },
  {
    id: "client-project",
    name: "Documentation Projet Client",
    description: "Description, tâches/scopes, et ressources du projet",
    icon: "📋",
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2, textAlign: null },
          content: [{ type: "text", text: "Description du Projet" }],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
          content: [
            {
              type: "text",
              text: "Décrivez ici le contexte et les objectifs principaux du projet client...",
              marks: [{ type: "italic" }],
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
        },
        {
          type: "heading",
          attrs: { level: 2, textAlign: null },
          content: [{ type: "text", text: "Tâches et Scopes" }],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
          content: [
            {
              type: "text",
              text: "Listez les différentes tâches et scopes du projet :",
              marks: [{ type: "italic" }],
            },
          ],
        },
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: false },
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [{ type: "text", text: "Tâche 1 - Description de la tâche" }],
                },
              ],
            },
            {
              type: "taskItem",
              attrs: { checked: false },
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [{ type: "text", text: "Tâche 2 - Description de la tâche" }],
                },
              ],
            },
            {
              type: "taskItem",
              attrs: { checked: false },
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [{ type: "text", text: "Tâche 3 - Description de la tâche" }],
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
        },
        {
          type: "heading",
          attrs: { level: 2, textAlign: null },
          content: [{ type: "text", text: "Ressources à Disposition" }],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
          content: [
            {
              type: "text",
              text: "Documentez les ressources disponibles pour la réalisation du projet :",
              marks: [{ type: "italic" }],
            },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [
                    { type: "text", text: "Équipe : ", marks: [{ type: "bold" }] },
                    { type: "text", text: "Membres de l'équipe et leurs rôles" },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [
                    { type: "text", text: "Outils : ", marks: [{ type: "bold" }] },
                    { type: "text", text: "Technologies et outils utilisés" },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [
                    { type: "text", text: "Documentation : ", marks: [{ type: "bold" }] },
                    { type: "text", text: "Liens vers la documentation pertinente" },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [
                    { type: "text", text: "Budget : ", marks: [{ type: "bold" }] },
                    { type: "text", text: "Informations budgétaires si applicable" },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
        },
      ],
    },
  },
  {
    id: "technical-solution",
    name: "Solution Technique",
    description: "Description technique, roadmap détaillée et ressources nécessaires",
    icon: "⚙️",
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2, textAlign: null },
          content: [{ type: "text", text: "Description Technique" }],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
          content: [
            {
              type: "text",
              text: "Décrivez la solution technique, l'architecture et les choix technologiques...",
              marks: [{ type: "italic" }],
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
        },
        {
          type: "heading",
          attrs: { level: 3, textAlign: null },
          content: [{ type: "text", text: "Architecture" }],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
          content: [
            {
              type: "text",
              text: "Diagramme ou description de l'architecture du système...",
              marks: [{ type: "italic" }],
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
        },
        {
          type: "heading",
          attrs: { level: 3, textAlign: null },
          content: [{ type: "text", text: "Technologies Utilisées" }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [
                    { type: "text", text: "Frontend : ", marks: [{ type: "bold" }] },
                    { type: "text", text: "Technologie(s) utilisée(s)" },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [
                    { type: "text", text: "Backend : ", marks: [{ type: "bold" }] },
                    { type: "text", text: "Technologie(s) utilisée(s)" },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [
                    { type: "text", text: "Base de données : ", marks: [{ type: "bold" }] },
                    { type: "text", text: "Type et configuration" },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [
                    { type: "text", text: "Infrastructure : ", marks: [{ type: "bold" }] },
                    { type: "text", text: "Hébergement, CI/CD, etc." },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
        },
        {
          type: "heading",
          attrs: { level: 2, textAlign: null },
          content: [{ type: "text", text: "Roadmap Détaillée" }],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
          content: [
            {
              type: "text",
              text: "Étapes détaillées pour reproduire ou implémenter le projet :",
              marks: [{ type: "italic" }],
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
        },
        {
          type: "heading",
          attrs: { level: 3, textAlign: null },
          content: [{ type: "text", text: "Phase 1 : Configuration Initiale" }],
        },
        {
          type: "orderedList",
          attrs: { start: 1 },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [{ type: "text", text: "Configuration de l'environnement de développement" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [{ type: "text", text: "Installation des dépendances" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [{ type: "text", text: "Configuration de la base de données" }],
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
        },
        {
          type: "heading",
          attrs: { level: 3, textAlign: null },
          content: [{ type: "text", text: "Phase 2 : Développement Core" }],
        },
        {
          type: "orderedList",
          attrs: { start: 1 },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [{ type: "text", text: "Implémentation des fonctionnalités principales" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [{ type: "text", text: "Tests unitaires et d'intégration" }],
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
        },
        {
          type: "heading",
          attrs: { level: 3, textAlign: null },
          content: [{ type: "text", text: "Phase 3 : Déploiement" }],
        },
        {
          type: "orderedList",
          attrs: { start: 1 },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [{ type: "text", text: "Configuration de l'environnement de production" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [{ type: "text", text: "Mise en production et monitoring" }],
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
        },
        {
          type: "heading",
          attrs: { level: 2, textAlign: null },
          content: [{ type: "text", text: "Ressources Nécessaires" }],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
          content: [
            {
              type: "text",
              text: "Listez toutes les ressources nécessaires à la réalisation du projet :",
              marks: [{ type: "italic" }],
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
        },
        {
          type: "heading",
          attrs: { level: 3, textAlign: null },
          content: [{ type: "text", text: "Ressources Humaines" }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [{ type: "text", text: "Développeur(s) Full-Stack" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [{ type: "text", text: "DevOps / Infrastructure" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [{ type: "text", text: "Chef de projet / Product Owner" }],
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
        },
        {
          type: "heading",
          attrs: { level: 3, textAlign: null },
          content: [{ type: "text", text: "Ressources Techniques" }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [
                    { type: "text", text: "Serveurs : ", marks: [{ type: "bold" }] },
                    { type: "text", text: "Spécifications requises" },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [
                    { type: "text", text: "API externes : ", marks: [{ type: "bold" }] },
                    { type: "text", text: "Services tiers utilisés" },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [
                    { type: "text", text: "Licences : ", marks: [{ type: "bold" }] },
                    { type: "text", text: "Logiciels payants nécessaires" },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
        },
        {
          type: "heading",
          attrs: { level: 3, textAlign: null },
          content: [{ type: "text", text: "Documentation de Référence" }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [{ type: "text", text: "Lien vers la documentation officielle" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [{ type: "text", text: "Tutoriels et guides pertinents" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [{ type: "text", text: "Ressources de formation" }],
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
        },
      ],
    },
  },
];

export function getTemplateById(id: string): PageTemplate | undefined {
  return pageTemplates.find((t) => t.id === id);
}
