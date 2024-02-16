(function() {
var pluginVersion = '0.1.1';

var machine = null;
var lastHeartbeatAt = 0;
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

        clickListener = async () => await sendHeartbeat(Date.now());
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

async function sendHeartbeat(time) {
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

    const url = 'https://api.wakatime.com/api/v1/users/current/heartbeats';
    const body = JSON.stringify({
        time: time / 1000,
        entity: 'Blockbench',
        type: 'app',
        project: project.getDisplayName(),
        plugin: `${platform()} blockbench/${Blockbench.version} blockbench-wakatime/${pluginVersion}`,
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

function platform() {
    var name = process.platform;
    return name === 'win32' ? 'windows' : name;
}

function machineName() {
    if (machine) return machine;
    const osname = platform();
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

function readFile(file) {
    var fs = require('fs');
    try {
        return fs.readFileSync(file, 'utf-8');
    } catch (e) {}
    return '';
}
})();