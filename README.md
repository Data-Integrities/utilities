# Development Utilities

A collection of development tools used across Data Integrities projects (care-connect and behr). These utilities assist with backend development, UI/UX analysis, documentation, and repository synchronization.

## Available Utilities

### [Capture Tools](capture/)

Tools for capturing network traffic and screen layouts from live healthcare applications.

#### [Network Capture](capture/network/)

Captures network traffic from Baylor's MyBSWHealth screens to analyze how endpoints are used by the backend.

**Key Features:**

- Captures HTTP requests/responses with full details
- Records cookies, headers, and POST data
- Automatically stops at target endpoints
- Filters out analytics and media files

**Use Cases:**

- Debug authentication flows
- Analyze API request/response structures
- Understand cookie flow and session management
- Document endpoint behavior for backend development

See the [Network Capture README](capture/network/README.md) for detailed setup and usage instructions.

#### [Screen Capture](capture/screen/)

Captures screens from the web version of MyBSWHealth at responsive breakpoints for Flutter UI development.

**Key Features:**

- Smart CSS breakpoint detection from media queries
- Interactive web interface for breakpoint selection
- Three-state workflow: Capture → Select → Build
- Exports JSON format for automated Flutter screen generation

**Use Cases:**

- Build responsive Flutter screens that resize appropriately
- Ensure consistent design across different screen sizes
- Analyze layout behavior at various breakpoints
- Generate accurate Flutter widgets from web designs

See the [Screen Capture README](capture/screen/README.md) for detailed setup and usage instructions.

### [Thread Tools](thread-tools/)

Cross-conversation memory search utilities that enable Claude Code to search through previous conversation history.

**Key Capability:**

- Search across all conversation history to find past discussions and solutions
- Reference past work and decisions across sessions
- Build cumulative knowledge that persists between conversations

See the [Thread Tools README](thread-tools/README.md) for complete documentation.

### Documentation Status Script

`documentation-status.sh` - Analyzes documentation across the project to report on coverage and status.

## Getting Started

**New to utilities?** See the [Dependencies and Setup Guide](dependencies.md) for:

- Prerequisites and installation steps
- Shared configuration (MyBSWHealth credentials)
- Environment variable setup
- Utility-specific dependencies

Each utility also has its own detailed README with usage examples and workflows.

## Project Structure

```text
utilities/
├── capture/
│   ├── network/          # Network traffic capture tool
│   └── screen/           # Responsive breakpoint capture tool
├── thread-tools/         # Cross-conversation memory search
├── documentation-status.sh
├── dependencies.md
└── README.md             # This file
```

## Claude Conversation Search

For information about searching through past Claude conversations, see:

- [Thread Tools README](thread-tools/README.md) - Complete guide to cross-conversation search
- Example projects that use this:
  - `care-connect/api` - API development conversations
  - `behr/api` - Backend API conversations

**Example Usage:**

```bash
# Search for discussions about API endpoints in the care-connect/api project
grep -r "authentication" ~/.claude/projects/-Users-jeffk-dev-data-integrities-care-connect-api/

# Search for discussions in the behr/api project
grep -r "patient data" ~/.claude/projects/-Users-jeffk-dev-baylor-behr-api/
```

## Support

For utility-specific questions or issues, refer to the documentation in each utility's folder. Each README includes:

- Troubleshooting guides
- Common issues and solutions
- Advanced usage examples
- Support resources
