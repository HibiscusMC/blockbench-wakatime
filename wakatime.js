(function() {
//#region ------ Constants ------
const pluginVersion = '0.1.1';
//#endregion

//#region ------ Blockbench Plugin Registration ------
var deletables = [];
var clickListener = null;

BBPlugin.register('wakatime', {
    title: 'WakaTime',
    icon: 'fas.fa-circle-check',
    author: 'yusshu',
    description: 'The plugin for productivity metrics, goals, leaderboards, and automatic time tracking.',
    about: 'Automatic time tracking and stats about your Blockbench usage.',
    version: pluginVersion,
    min_version: '4.6.0',
    variant: 'desktop',
    onload() {
        // Register API key setting and get the value
        deletables.push(new Setting('wakatime_api_key', {
            name: 'WakaTime API Key',
            category: 'general',
            description: 'Your WakaTime API Key, get it from https://wakatime.com/api-key',
            type: 'password',
            value: ''
        }));

        // Send heartbeat on click
        clickListener = async () => await sendHeartbeat();
        document.addEventListener('click', clickListener);
    },
    onunload() {
        if (clickListener !== null) {
            document.removeEventListener('click', clickListener);
            clickListener = null;
        }
        deletables.forEach(deletable => deletable.delete());
    }
});
//#endregion ------ Blockbench Plugin Registration ------

//#region ------ Heartbeat ------
let lastHeartbeatAt = 0;

async function sendHeartbeat() {
    if (!isCLIInstalled()) {
        return;
    }

    const time = Date.now();

    var project = Project;

    if (project === 0) {
        return;
    }

    var apiKey = Settings.get('wakatime_api_key') ?? '';
    if (apiKey === '') {
        return;
    }

    if (time - lastHeartbeatAt < 120000) {
        return;
    }
    lastHeartbeatAt = time;

    const args = [
        '--plugin', `${osName()} blockbench/${Blockbench.version} blockbench-wakatime/${pluginVersion}`,
        '--entity', 'Blockbench',
        '--entity-type', 'app',
        '--project', project.getDisplayName()
    ];

    const url = 'https://api.wakatime.com/api/v1/users/current/heartbeats';
    const body = JSON.stringify({
        project: project.getDisplayName(),
    });
    const headers = {
        Authorization: `Basic ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': new TextEncoder().encode(body).length,
    };
    const machine = machineName();
    if (machine) {
        headers['X-Machine-Name'] = machine;
    }

    const response = await fetch(url, {
        method: 'POST',
        body: body,
        headers: headers,
    });

    const data = await response.text();

    if (response.status < 200 || response.status >= 300) {
        console.warn(`WakaTime API Error ${response.status}: ${data}`);
    }
}
//#endregion ------ Heartbeat ------

//#region ------ OS, Machine, Architecture ------
function osName() {
    var name = process.platform;
    return name === 'win32' ? 'windows' : name;
}

function isWindows() {
    return osName() === 'windows';
}

let machine = null;
function machineName() {
    if (machine) return machine;
    const osname = osName();
    if (osname === 'darwin') {
        const content = readFile('/Library/Preferences/SystemConfiguration/com.apple.smb.server.plist');
        const lines = content.split('\n');
        let found = false;
        for (var i = 0; i < lines.length; i++) {
            let line = lines[i];
            if (found && line.includes('<string>')) {
                machine = line.trim().replace('<string>', '').replace('</string>', '').trim();
                found = false;
            } else if (line.trim() == '<key>NetBIOSName</key>') {
                found = true;
            }
        }
    } else if (osname === 'windows') {
        machine = process.env.COMPUTERNAME;
    } else {
        machine = readFile('/etc/hostname').trim();
    }
    return machine;
}

function architecture() {
    const arch = process.arch;
    if (arch.indexOf('arm') > -1) return arch;
    if (arch.indexOf('32') > -1) return '386';
    return 'amd64';
}
//#endregion ------ OS, Machine, Architecture ------

//#region ------ File I/O ------
function readFile(file) {
    var fs = require('fs');
    try {
        return fs.readFileSync(file, 'utf-8');
    } catch (e) {}
    return '';
}

function downloadFile(url, outputFile, callback) {
    const https = require('https');
    const fs = require('fs');
    const file = fs.createWriteStream(outputFile);
    https.get(url, function(response) {
        response.pipe(file);
        file.on('finish', function() {
            file.close(callback);
        });
    });
}

async function unzip(file, outputDir) {
    if (await pathExists(file)) {
        try {
            await decompress(file, outputDir);
        } catch (e) {
            log.warn(e);
        } finally {
            try {
                await del([file], { force: true });
            } catch (err) {
                log.warn(err);
            }
        }
    }
}
//#endregion ------ File I/O ------

//#region ------ wakatime-cli download & install ------
function isCLIInstalled() {
    var fs = require('fs');
    return fs.existsSync(getCliLocation());
}

function isCLILatest(callback) {
    var args = [ '--version' ];
    var child_process = require('child_process');
    child_process.execFile(getCliLocation(), args, (error, stdout, stderr) => {
        if (error == null) {
            var currentVersion = stdout.trim() + stderr.trim();
            console.log(`Current wakatime-cli version is ${currentVersion}`);
            console.log('Checking for updates to wakatime-cli...');
            getLatestCliVersion((latestVersion) => {
                if (currentVersion === latestVersion) {
                    console.log('wakatime-cli is up to date.');
                    if (callback) callback(true);
                } else {
                    if (latestVersion != null) {
                        console.log(`Found an updated wakatime-cli ${latestVersion}`);
                        if (callback) callback(false);
                    } else {
                        console.log('Unable to find latest wakatime-cli version.');
                        if (callback) callback(true);
                    }
                }
            });
        } else {
            if (callback) callback(false);
        }
    });
}

function getLatestCliVersion(callback) {
    if (latestCliVersion) {
        callback(latestCliVersion);
        return;
    }

    const opt = {
        url: 'https://api.github.com/repos/wakatime/wakatime-cli/releases/latest',
        json: true,
        headers: {
            'User-Agent': 'github.com/HibiscusMC/blockbench-wakatime',
        }
    };
    try {
        request.get(opt, (error, response, json) => {
            if (!error && response && (response.statusCode == 200 || response.statusCode == 304)) {
                log.debug(`GitHub API Response ${response.statusCode}`);
                if (response.statusCode == 304) {
                    options.getSetting('internal', 'cli_version', true, (version) => {
                        latestCliVersion = version.value;
                        callback(latestCliVersion);
                    });
                    return;
                }
                latestCliVersion = alpha.value == 'true' ? json[0]['tag_name'] : json['tag_name'];
                log.debug(`Latest wakatime-cli version from GitHub: ${latestCliVersion}`);
                const lastModified = response.headers['last-modified'];
                if (lastModified) {
                    options.setSettings('internal', true, [
                        { key: 'cli_version', value: latestCliVersion },
                        { key: 'cli_version_last_modified', value: lastModified },
                    ]);
                }
                callback(latestCliVersion);
                return;
            } else {
                if (response) {
                    log.warn(`GitHub API Response ${'statusCode' in response ? response.statusCode : ''}: ${error}`);
                } else {
                    log.warn(`GitHub API Request Error: ${error}`);
                }
                callback('');
            }
        });
    } catch (e) {
        log.warn(e);
        callback('');
    }
}

function getResourcesLocation() {
    if (resourcesLocation) return resourcesLocation;

    resourcesLocation = path.join(getHomeDirectory(), '.wakatime');
    try {
        fs.mkdirSync(resourcesLocation, { recursive: true });
    } catch (e) {
        log.error(e);
    }
    return resourcesLocation;
}

function getConfigFile(internal) {
    if (internal) return path.join(getHomeDirectory(), '.wakatime-internal.cfg');
    return path.join(getHomeDirectory(), '.wakatime.cfg');
}

function getHomeDirectory() {
    let home = process.env.WAKATIME_HOME;
    if (home && home.trim() && fs.existsSync(home.trim())) return home.trim();
    return process.env[isWindows() ? 'USERPROFILE' : 'HOME'] || '';
}

function getCliLocation() {
    const ext = isWindows() ? '.exe' : '';
    const osname = getOS();
    const arch = architecture();
    return path.join(getResourcesLocation(), `wakatime-cli-${osname}-${arch}${ext}`);
}

function isSymlink(file) {
    try {
        return fs.lstatSync(file).isSymbolicLink();
    } catch (_) {}
    return false;
}

function installCLI(callback) {
    getLatestCliVersion((version) => {
        const url = cliDownloadUrl(version);
        log.debug(`Downloading wakatime-cli from ${url}`);
        if (statusBarIcon != null) {
            statusBarIcon.setStatus('downloading wakatime-cli...');
        }
        const zipFile = path.join(getResourcesLocation(), 'wakatime-cli.zip');
        downloadFile(url, zipFile, async () => {
            await extractCLI(zipFile);
            const cli = getCliLocation();
            try {
                log.debug('Chmod 755 wakatime-cli...');
                fs.chmodSync(cli, 0o755);
            } catch (e) {
                log.warn(e);
            }
            const ext = isWindows() ? '.exe' : '';
            const link = path.join(getResourcesLocation(), `wakatime-cli${ext}`);
            if (!isSymlink(link)) {
                try {
                    log.debug(`Create symlink from wakatime-cli to ${cli}`);
                    fs.symlinkSync(cli, link);
                } catch (e) {
                    log.warn(e);
                    try {
                        fs.copyFileSync(cli, link);
                        fs.chmodSync(link, 0o755);
                    } catch (e2) {
                        log.warn(e2);
                    }
                }
            }
        });
    });
}

async function extractCLI(zipFile) {
    log.debug('Extracting wakatime-cli.zip file...');
    if (statusBarIcon != null) {
        statusBarIcon.setStatus('extracting wakatime-cli...');
    }
    await removeCLI();
    await unzip(zipFile, getResourcesLocation());
}

async function removeCLI() {
    try {
        await del([getCliLocation()], { force: true });
    } catch (e) {
        log.warn(e);
    }
}

function cliDownloadUrl(version) {
    const osname = osName();
    const arch = architecture();

    const validCombinations = [
        'darwin-amd64',
        'darwin-arm64',
        'freebsd-386',
        'freebsd-amd64',
        'freebsd-arm',
        'linux-386',
        'linux-amd64',
        'linux-arm',
        'linux-arm64',
        'netbsd-386',
        'netbsd-amd64',
        'netbsd-arm',
        'openbsd-386',
        'openbsd-amd64',
        'openbsd-arm',
        'openbsd-arm64',
        'windows-386',
        'windows-amd64',
        'windows-arm64',
    ];
    if (!validCombinations.includes(`${osname}-${arch}`)) {
        console.error(`Unsupported platform: ${osname}-${arch}`);
    }

    return `https://github.com/wakatime/wakatime-cli/releases/download/${version}/wakatime-cli-${osname}-${arch}.zip`;
}
//#endregion
})();