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
    name: "Blank Page",
    description: "Start with an empty page",
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
    name: "Client Project Documentation",
    description: "Project description, tasks/scopes, and available resources",
    icon: "📋",
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2, textAlign: null },
          content: [{ type: "text", text: "Project Description" }],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
          content: [
            {
              type: "text",
              text: "Describe the context and main objectives of the client project here...",
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
          content: [{ type: "text", text: "Tasks and Scopes" }],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
          content: [
            {
              type: "text",
              text: "List the different tasks and scopes of the project:",
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
                  content: [{ type: "text", text: "Task 1 - Task description" }],
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
                  content: [{ type: "text", text: "Task 2 - Task description" }],
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
                  content: [{ type: "text", text: "Task 3 - Task description" }],
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
          content: [{ type: "text", text: "Available Resources" }],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
          content: [
            {
              type: "text",
              text: "Document the resources available for project completion:",
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
                    { type: "text", text: "Team: ", marks: [{ type: "bold" }] },
                    { type: "text", text: "Team members and their roles" },
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
                    { type: "text", text: "Tools: ", marks: [{ type: "bold" }] },
                    { type: "text", text: "Technologies and tools used" },
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
                    { type: "text", text: "Documentation: ", marks: [{ type: "bold" }] },
                    { type: "text", text: "Links to relevant documentation" },
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
                    { type: "text", text: "Budget: ", marks: [{ type: "bold" }] },
                    { type: "text", text: "Budget information if applicable" },
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
    name: "Technical Solution",
    description: "Technical description, detailed roadmap and required resources",
    icon: "⚙️",
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2, textAlign: null },
          content: [{ type: "text", text: "Technical Description" }],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
          content: [
            {
              type: "text",
              text: "Describe the technical solution, architecture and technology choices...",
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
              text: "Diagram or description of the system architecture...",
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
          content: [{ type: "text", text: "Technologies Used" }],
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
                    { type: "text", text: "Frontend: ", marks: [{ type: "bold" }] },
                    { type: "text", text: "Technology(ies) used" },
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
                    { type: "text", text: "Backend: ", marks: [{ type: "bold" }] },
                    { type: "text", text: "Technology(ies) used" },
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
                    { type: "text", text: "Database: ", marks: [{ type: "bold" }] },
                    { type: "text", text: "Type and configuration" },
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
                    { type: "text", text: "Infrastructure: ", marks: [{ type: "bold" }] },
                    { type: "text", text: "Hosting, CI/CD, etc." },
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
          content: [{ type: "text", text: "Detailed Roadmap" }],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
          content: [
            {
              type: "text",
              text: "Detailed steps to reproduce or implement the project:",
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
          content: [{ type: "text", text: "Phase 1: Initial Setup" }],
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
                  content: [{ type: "text", text: "Development environment configuration" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [{ type: "text", text: "Dependencies installation" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [{ type: "text", text: "Database configuration" }],
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
          content: [{ type: "text", text: "Phase 2: Core Development" }],
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
                  content: [{ type: "text", text: "Implementation of main features" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [{ type: "text", text: "Unit and integration testing" }],
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
          content: [{ type: "text", text: "Phase 3: Deployment" }],
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
                  content: [{ type: "text", text: "Production environment configuration" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [{ type: "text", text: "Production deployment and monitoring" }],
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
          content: [{ type: "text", text: "Required Resources" }],
        },
        {
          type: "paragraph",
          attrs: { textAlign: null },
          content: [
            {
              type: "text",
              text: "List all resources required for project completion:",
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
          content: [{ type: "text", text: "Human Resources" }],
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
                  content: [{ type: "text", text: "Full-Stack Developer(s)" }],
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
                  content: [{ type: "text", text: "Project Manager / Product Owner" }],
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
          content: [{ type: "text", text: "Technical Resources" }],
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
                    { type: "text", text: "Servers: ", marks: [{ type: "bold" }] },
                    { type: "text", text: "Required specifications" },
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
                    { type: "text", text: "External APIs: ", marks: [{ type: "bold" }] },
                    { type: "text", text: "Third-party services used" },
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
                    { type: "text", text: "Licenses: ", marks: [{ type: "bold" }] },
                    { type: "text", text: "Required paid software" },
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
          content: [{ type: "text", text: "Reference Documentation" }],
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
                  content: [{ type: "text", text: "Link to official documentation" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [{ type: "text", text: "Relevant tutorials and guides" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: null },
                  content: [{ type: "text", text: "Training resources" }],
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
