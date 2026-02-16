#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { downloadTemplate } from 'giget';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { fileURLToPath } from 'url';
import os from 'os';

// Get package.json for version
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));

// ============================================================================
// CONSTANTS
// ============================================================================

const AGENT_FOLDER = '.agent';
const TEMP_FOLDER = '.temp_ag_jz';
const REGISTRY_FILE = '.sync-registry.json';

// Default kits to sync when using --all
const DEFAULT_KITS = [
    'github:anthonylee991/gemini-superpowers-antigravity',
    'github:vudovn/antigravity-kit',
    'github:sickn33/antigravity-awesome-skills',
];

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Get the global Antigravity .agent directory
 * @returns {string} Path to global .agent folder
 */
const getGlobalAgentDir = () => {
    const homeDir = os.homedir();
    return path.join(homeDir, '.gemini', 'antigravity', AGENT_FOLDER);
};

/**
 * Display ASCII banner
 * @param {boolean} quiet - Skip banner if true
 */
const showBanner = (quiet = false) => {
    if (quiet) return;
    console.log(chalk.blueBright(`
    ╔══════════════════════════════════════╗
    ║        AG-JZ CLI                     ║
    ║   Multi-Kit Antigravity Manager      ║
    ╚══════════════════════════════════════╝
    `));
};

/**
 * Log message if not in quiet mode
 * @param {string} message - Message to log
 * @param {boolean} quiet - Skip logging if true
 */
const log = (message, quiet = false) => {
    if (!quiet) console.log(message);
};

/**
 * Ask user for confirmation
 * @param {string} question - Question to ask
 * @returns {Promise<boolean>}
 */
const confirm = (question) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(chalk.yellow(`${question} (y/N): `), (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
};

/**
 * Clean up temporary directory
 * @param {string} tempDir - Temp directory path
 */
const cleanup = (tempDir) => {
    if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
};

/**
 * Load sync registry
 * @param {string} globalDir - Global .agent directory
 * @returns {Object} Registry data
 */
const loadRegistry = (globalDir) => {
    const registryPath = path.join(globalDir, REGISTRY_FILE);
    if (fs.existsSync(registryPath)) {
        return JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    }
    return { kits: {}, files: {} };
};

/**
 * Save sync registry
 * @param {string} globalDir - Global .agent directory
 * @param {Object} registry - Registry data
 */
const saveRegistry = (globalDir, registry) => {
    const registryPath = path.join(globalDir, REGISTRY_FILE);
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
};

/**
 * Merge .agent folder from temp to global directory
 * @param {string} tempDir - Temp directory
 * @param {string} globalDir - Global .agent directory
 * @param {string} repoSource - Repository source identifier
 */
const mergeAgentFolder = (tempDir, globalDir, repoSource) => {
    let sourceAgent = path.join(tempDir, AGENT_FOLDER);
    let isRootSync = false;

    // Fallback: If .agent folder doesn't exist, use root folder but filter content
    if (!fs.existsSync(sourceAgent)) {
        // Check if common agent folders exist in root
        const commonFolders = ['skills', 'workflows', 'rules', 'scripts', 'docs', 'assets'];
        const hasCommonFolders = commonFolders.some(folder => fs.existsSync(path.join(tempDir, folder)));

        if (hasCommonFolders) {
            sourceAgent = tempDir; // Use root as source
            isRootSync = true;
        } else {
            throw new Error(`Could not find ${AGENT_FOLDER} folder or common agent folders (skills, workflows, scripts) in source repository!`);
        }
    }

    // Ensure global directory exists
    if (!fs.existsSync(globalDir)) {
        fs.mkdirSync(globalDir, { recursive: true });
    }

    // Load registry
    const registry = loadRegistry(globalDir);
    const kitId = repoSource.replace(/[^a-zA-Z0-9]/g, '_');
    
    if (!registry.kits[kitId]) {
        registry.kits[kitId] = {
            source: repoSource,
            installedAt: new Date().toISOString(),
            files: []
        };
    }
    
    registry.kits[kitId].lastUpdated = new Date().toISOString();

    // Recursively copy and merge files
    const copyRecursive = (src, dest, relativePath = '') => {
        const entries = fs.readdirSync(src, { withFileTypes: true });

        for (const entry of entries) {
            // Filter excluded files/folders when syncing from root
            if (isRootSync && relativePath === '') {
                const exclude = ['.git', '.github', 'node_modules', 'README.md', 'LICENSE', 'package.json', 'package-lock.json', '.gitignore'];
                if (exclude.includes(entry.name)) continue;
            }

            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            const relPath = path.join(relativePath, entry.name);

            if (entry.isDirectory()) {
                if (!fs.existsSync(destPath)) {
                    fs.mkdirSync(destPath, { recursive: true });
                }
                copyRecursive(srcPath, destPath, relPath);
            } else {
                // Copy file (overwrite if exists)
                try {
                    fs.copyFileSync(srcPath, destPath);
                    
                    // Track in registry
                    registry.files[relPath] = {
                        kit: kitId,
                        updatedAt: new Date().toISOString()
                    };
                    
                    if (!registry.kits[kitId].files.includes(relPath)) {
                        registry.kits[kitId].files.push(relPath);
                    }
                } catch (err) {
                    // Ignore errors for locked files or permissions, but log?
                    // console.error(`Warning: Could not copy ${srcPath}: ${err.message}`);
                }
            }
        }
    };

    copyRecursive(sourceAgent, globalDir);
    
    // Save updated registry
    saveRegistry(globalDir, registry);
};

// ============================================================================
// COMMANDS
// ============================================================================

/**
 * Sync command - Download and merge kit(s) into global directory
 */
const syncCommand = async (repoSource, options) => {
    const quiet = options.quiet || false;
    const dryRun = options.dryRun || false;
    const syncAll = options.all || false;

    showBanner(quiet);

    const globalDir = getGlobalAgentDir();
    const tempDir = path.join(os.tmpdir(), TEMP_FOLDER);

    // Determine which repos to sync
    const repos = syncAll ? DEFAULT_KITS : [repoSource];

    if (!syncAll && !repoSource) {
        console.log(chalk.red('Error: Please specify a repository or use --all flag'));
        console.log(chalk.yellow(`Example: ${chalk.cyan('ag-jz sync github:user/repo')}`));
        process.exit(1);
    }

    // Dry run mode
    if (dryRun) {
        console.log(chalk.blueBright('\n[Dry Run] No changes will be made\n'));
        console.log(chalk.white('Would sync the following repositories:'));
        console.log(chalk.gray('────────────────────────────────────────'));
        repos.forEach((repo, i) => {
            console.log(`  ${i + 1}. ${chalk.cyan(repo)}`);
        });
        console.log(chalk.gray('────────────────────────────────────────'));
        console.log(`  Target: ${chalk.cyan(globalDir)}\n`);
        return;
    }

    const spinner = quiet ? null : ora({
        text: 'Starting sync...',
        color: 'cyan',
    }).start();

    try {
        for (const repo of repos) {
            if (spinner) spinner.text = `Downloading ${repo}...`;
            
            // Download repository using giget
            await downloadTemplate(repo, {
                dir: tempDir,
                force: true,
            });

            if (spinner) spinner.text = `Merging ${repo}...`;

            // Merge .agent folder
            mergeAgentFolder(tempDir, globalDir, repo);

            // Cleanup temp
            cleanup(tempDir);
        }

        if (spinner) {
            spinner.succeed(chalk.green(`Successfully synced ${repos.length} kit(s)!`));
        }

        // Success message
        if (!quiet) {
            console.log(chalk.gray('\n────────────────────────────────────────'));
            console.log(chalk.white('Result:'));
            console.log(`   Global: ${chalk.cyan(globalDir)}`);
            console.log(`   Kits:   ${chalk.yellow(repos.length)} synced`);
            console.log(chalk.gray('────────────────────────────────────────'));
            console.log(chalk.green('\nSync complete!\n'));
        }
    } catch (error) {
        if (spinner) {
            spinner.fail(chalk.red(`Error: ${error.message}`));
        } else {
            console.error(chalk.red(`Error: ${error.message}`));
        }
        cleanup(tempDir);
        process.exit(1);
    }
};

/**
 * Link command - Create symlink from global to current workspace
 */
const linkCommand = async (options) => {
    const quiet = options.quiet || false;
    const force = options.force || false;

    showBanner(quiet);

    const globalDir = getGlobalAgentDir();
    const targetDir = path.resolve(options.path || process.cwd());
    const localAgentDir = path.join(targetDir, AGENT_FOLDER);

    // Check if global .agent exists
    if (!fs.existsSync(globalDir)) {
        console.log(chalk.red(`Error: Global .agent directory not found at: ${globalDir}`));
        console.log(chalk.yellow(`Tip: Run ${chalk.cyan('ag-jz sync --all')} first.`));
        process.exit(1);
    }

    // Check if local .agent already exists
    if (fs.existsSync(localAgentDir)) {
        if (!force) {
            log(chalk.yellow(`Warning: ${AGENT_FOLDER} already exists at: ${localAgentDir}`), quiet);
            const shouldOverwrite = await confirm('Do you want to replace it with a symlink?');

            if (!shouldOverwrite) {
                log(chalk.gray('Operation cancelled.'), quiet);
                process.exit(0);
            }
        }
        
        // Remove existing .agent
        fs.rmSync(localAgentDir, { recursive: true, force: true });
    }

    try {
        // Create symlink (works on Windows, Linux, Mac)
        fs.symlinkSync(globalDir, localAgentDir, 'junction');

        log(chalk.green('\n✓ Symlink created successfully!'), quiet);
        log(chalk.gray('────────────────────────────────────────'), quiet);
        log(chalk.white(`  ${localAgentDir}`), quiet);
        log(chalk.gray('  ↓'), quiet);
        log(chalk.cyan(`  ${globalDir}`), quiet);
        log(chalk.gray('────────────────────────────────────────\n'), quiet);
    } catch (error) {
        console.error(chalk.red(`Error creating symlink: ${error.message}`));
        process.exit(1);
    }
};

/**
 * Status command - Show installed kits and global directory info
 */
const statusCommand = (options) => {
    const globalDir = getGlobalAgentDir();

    console.log(chalk.blueBright('\nAG-JZ Status\n'));

    if (!fs.existsSync(globalDir)) {
        console.log(chalk.red('[X] Global directory not initialized'));
        console.log(chalk.yellow(`Run ${chalk.cyan('ag-jz sync --all')} to get started.\n`));
        return;
    }

    const registry = loadRegistry(globalDir);
    const kits = Object.keys(registry.kits);

    console.log(chalk.green('[OK] Global directory initialized'));
    console.log(chalk.gray('────────────────────────────────────────'));
    console.log(`Path:  ${chalk.cyan(globalDir)}`);
    console.log(`Kits:  ${chalk.yellow(kits.length)} installed`);
    console.log(chalk.gray('────────────────────────────────────────\n'));

    if (kits.length > 0) {
        console.log(chalk.white('Installed Kits:\n'));
        kits.forEach((kitId, i) => {
            const kit = registry.kits[kitId];
            console.log(`  ${i + 1}. ${chalk.cyan(kit.source)}`);
            console.log(`     Files: ${chalk.gray(kit.files.length)}`);
            console.log(`     Updated: ${chalk.gray(new Date(kit.lastUpdated).toLocaleString())}\n`);
        });
    }
};

// ============================================================================
// CLI DEFINITION
// ============================================================================

const program = new Command();

program
    .name('ag-jz')
    .description('CLI tool to unify multiple Antigravity kits into a global directory')
    .version(pkg.version, '-v, --version', 'Display version number');

// Command: sync
program
    .command('sync [repo]')
    .description('Download and merge kit(s) into global directory')
    .option('-a, --all', 'Sync all default kits', false)
    .option('-q, --quiet', 'Suppress output (for CI/CD)', false)
    .option('--dry-run', 'Show what would be done without executing', false)
    .action(syncCommand);

// Command: link
program
    .command('link')
    .description('Create symlink from global .agent to current workspace')
    .option('-f, --force', 'Overwrite existing .agent folder', false)
    .option('-p, --path <dir>', 'Path to the workspace directory', process.cwd())
    .option('-q, --quiet', 'Suppress output (for CI/CD)', false)
    .action(linkCommand);

// Command: status
program
    .command('status')
    .description('Show installed kits and global directory info')
    .action(statusCommand);

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
    program.outputHelp();
}
