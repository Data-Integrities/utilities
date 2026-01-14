# Utilities - Dependencies and Setup

This document covers the prerequisites, installation steps, and configuration required to use the BEHR utilities.

## Getting Started

Each utility has its own specific requirements and dependencies. Before using any utility:

1. Navigate to the specific utility folder
2. Review its README for:
   - Prerequisites and installation steps
   - Configuration and credentials setup
   - Usage examples and workflows
   - Output formats and file structures

## Shared Configuration

Both capture utilities use the same MyBSWHealth credentials. Set these environment variables once to use both tools:

```bash
export MYBSWHEALTH_USERNAME="your-email@example.com"
export MYBSWHEALTH_PASSWORD="your-password"
```

### Persistent Setup

**For persistent setup**, add these to your shell profile (~/.zshrc or ~/.bashrc):

```bash
# Add to ~/.zshrc or ~/.bashrc
export MYBSWHEALTH_USERNAME="your-email@example.com"
export MYBSWHEALTH_PASSWORD="your-password"
```

### Using .env Files

**Alternatively**, create a `.env` file in each utility directory (already gitignored):

```bash
MYBSWHEALTH_USERNAME=your-email@example.com
MYBSWHEALTH_PASSWORD=your-password
```

## Utility-Specific Dependencies

See individual utility READMEs for additional configuration options and specific dependencies:

- [Network Capture Dependencies](capture/network/README.md)
- [Screen Capture Dependencies](capture/screen/README.md)

## Troubleshooting

For utility-specific questions or issues, refer to the documentation in each utility's folder. Each README includes:

- Troubleshooting guides
- Common issues and solutions
- Advanced usage examples
- Support resources
