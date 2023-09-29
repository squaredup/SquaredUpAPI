import axios from 'axios';
import fs from 'fs';
import mustache from 'mustache';

// Set a name prefix to allow easy cleanup of resources
// created by this script at any later time
const namePrefix = '[API Test]';

// Set performCleanup to true to perform cleanup of
// all resources ever created by this script
const performCleanup = false;

// Alerting channel type Ids
const ChannelTypeIds = {
    SlackAPI: 'channeltype-00000000000000000001',
    SlackWebHook: 'channeltype-00000000000000000002',
    Teams: 'channeltype-00000000000000000003',
    Custom: 'channeltype-00000000000000000004',
    ServiceNow: 'channeltype-00000000000000000005',
    Email: 'channeltype-00000000000000000006',
    Zapier: 'channeltype-00000000000000000007'
};

// List existing alerting channels (name uniqueness enforced)
const channels = await GET('/alerting/channels');
const channelName = `${namePrefix} email alerting channel`;
let channel = channels.find((channel) => channel.displayName === channelName);
// Create email alerting channel if it doesn't already exist
if (!channel) {
    channel = await createEmailChannel(channelName);
}

// List existing plugin data sources
const pluginDataSources = await GET('/source/configs?type=source.plugin');

// List existing workspaces
const workspaces = await GET('/workspaces');

// Create a new workspace
const newWorkspaceId = await createWorkspace();

// Update the workspace
await updateWorkspace(newWorkspaceId);

// Read the workspace 
const newWorkspace = await readWorkspace(newWorkspaceId);
console.log('\n========== WORKSPACE ==========\n');
console.log(JSON.stringify(newWorkspace, null, 2));

// Create a new dashboard using the 'AWS Production' data source
const pluginDataSource = pluginDataSources.find(
    (ds) => ds.displayName === 'AWS Production'
);

if (pluginDataSource) {
    let dashboard = await createDashboard(newWorkspaceId, pluginDataSource);

    // Update the dashboard
    await updateDashboard(dashboard.id, dashboard.content);

    // Read the dashboard
    dashboard = await readDashboard(dashboard.id);
    console.log('\n========== DASHBOARD ==========\n');
    console.log(JSON.stringify(dashboard, null, 2));

    // Delete the dashboard
    if (performCleanup) {
        DELETE(`/dashboards/${dashboard.id}`);
        console.log(`\nDASHBOARD '${dashboard.displayName}' DELETED\n`);
    }
}

if (performCleanup) {
    // Cleanup workspaces
    let toDelete = (await GET('/workspaces')).filter((workspace) => {
        return workspace.displayName.startsWith(namePrefix);
    });
    await Promise.all(toDelete.map((workspace) => {
        return DELETE(`/workspaces/${workspace.id}`);
    }));
    console.log(`\nWORKSPACES with name prefix '${namePrefix}' DELETED\n`);

    // Cleanup alerting channels
    toDelete = (await GET('/alerting/channels')).filter((channel) => {
        return channel.displayName.startsWith(namePrefix);
    });
    await Promise.all(toDelete.map((channel) => {
        return DELETE(`/alerting/channels/${channel.id}`);
    }));
    console.log(`\nALERTING CHANNELS with name prefix '${namePrefix}' DELETED\n`);
}

console.log('\n========== FINISHED ==========\n');

// ========== ALERTING CHANNEL FUNCTIONS ==========

async function createEmailChannel(channelName) {
    const body = {
        displayName: channelName,
        description: 'Description for email channel',
        channelTypeId: ChannelTypeIds.Email,
        enabled: true,
        config: {
            emailAddresses: [
                { value: 'alert-user-1@acme.com', label: 'Alert User 1' },
                { value: 'alert-user-2@acme.com', label: 'Alert User 2' }
            ]
        }
    };
    const channel = await POST('/alerting/channels', body);
    return channel;
}

// ========== WORKSPACE FUNCTIONS ==========

async function createWorkspace() {
    const body = {
        displayName: `${namePrefix} My workspace`,
        // By default the workspace is visible to all users but if you want
        // to restrict it specify an acl.
        // Permissions are currently:
        // 'AD' = admin, 'RW' = read-write, 'RO' = read-only
        // For example:
        // acl: [
        //     { subjectId: 'admin-user@acme.com', permissions: ['AD'] },
        //     { subjectId: 'read-write-user@acme.com', permissions: ['RW'] },
        //     { subjectId: 'read-only-user@acme.com', permissions: ['RO'] }
        // ],
        // Specify alerting rules for the workspace, see updateWorkspace
        // below for an example configuration
        alertingRules: [],
        links: {
            // The plugin data sources this workspace can read data from.
            // You will likely want to filter this array.
            plugins: pluginDataSources.map((dataSource) => dataSource.id),
            // The other workspaces this workspace can read workspace health
            // state from (e.g. for health state rollup). You will likely
            // want to filter this array.
            workspaces: workspaces.map((workspace) => workspace.id)
        },
        properties: {
            // Whether dashboard sharing is enabled for the workspace
            openAccessEnabled: true,
            // Optional workspace tags
            tags: ['my tag', 'other tag'],
            // Optional workspace description
            description: 'This is my workspace description',
            // Optional workspace type that can be one of:
            // 'service', 'team', 'application', 'platform', 'product',
            // 'business service', 'microservice', 'customer', 'website',
            // 'component', 'resource', 'system', 'folder', 'other'
            type: 'folder'
        }
    };
    const workspaceId = await POST('/workspaces', body);
    return workspaceId;
}

async function updateWorkspace(workspaceId) {
    const body = {
        // Specify new name if you want to rename, otherwise don't
        // and the name will be unchanged
        displayName: `${namePrefix} My renamed workspace`,
        // Specify new acl if you want to change it, otherwise don't
        // and acl will be unchanged
        // Specify acl: null to disable restrictions for this workspace
        acl: null,
        // Specify alerting rules for the workspace to change them
        alertingRules: [
            {
                channels: [
                    {
                        // Use the email channel created earlier
                        id: channel.id,
                        // Whether to include a tile preview image
                        // in the alerting channel notifications
                        includePreviewImage: false
                    }
                ],
                conditions: {
                    monitors: {
                        // Generate notifications when the workspace health changes
                        rollupHealth: false,
                        // Generate notifications when the health of any dashboard
                        // in the workspace changes
                        dashboardRollupHealth: false,
                        // OR generate notifications when the health of specific
                        // dashboards / tiles in the workspace changes
                        // dashboards: {
                        //     'dash-MEYWu1h6nEfXcjKWGW2Q': {
                        //         // Generate notifications when the dashboard health changes
                        //         rollupHealth: false,
                        //         // Generate notifications when the health of specific tiles
                        //         // on the dashboard changes
                        //         // tiles: {
                        //         //     'b9dcb27d-3c64-65ab-733d-cb1e456d74e3': {
                        //         //         include: true
                        //         //     }
                        //         // },
                        //         // OR generate notifications when the health of any tile
                        //         // on the dashboard changes
                        //         includeAllTiles: true
                        //     }
                        // },
                        // OR generate notifications when the health of any tile
                        // in the workspace changes
                        includeAllTiles: true
                    }
                }
            }
        ],
        // Specify new links if you want to change them otherwise don't
        // and links will be unchanged
        // links: {
        //     plugins: pluginDataSources.map((dataSource) => dataSource.id),
        //     workspaces: workspaces.map((workspace) => workspace.id)
        // },
        //
        // If updating any workspace property then you must specify all those
        // you want to keep or they will be lost (all or nothing). If not
        // updating any properties then don't specify a properties object.
        properties: {
            // Whether dashboard sharing is enabled for the workspace
            openAccessEnabled: true,
            // Optional workspace tags
            tags: ['different tag'],
            // Optional workspace description
            description: 'Different workspace description',
            // Optional workspace type
            type: 'folder'
        }
    };
    await PUT(`/workspaces/${workspaceId}`, body);
}

async function readWorkspace(workspaceId) {
    const workspace = await GET(`/workspaces/${workspaceId}`);
    return {
        id: workspace.id,
        displayName: workspace.displayName,
        alertingRules: workspace.data.alertingRules,
        links: workspace.data.links,
        properties: workspace.data.properties,
        acl: await GET(`/accesscontrol/acl/${workspaceId}`)
    };
}

// ========== DASHBOARD FUNCTIONS ==========

async function createDashboard(workspaceId, pluginDataSource) {
    const pluginId = pluginDataSource.plugin.pluginId;
    const pluginDataStreams = await GET(`/config/datastreams/plugin/${pluginId}`);

    const template = fs.readFileSync('dashboardTemplate.json').toString();
    const templateBindings = {
        pluginDataSourceId: pluginDataSource.id,
        cpuDataStreamId: pluginDataStreams.find(
            (ds) => ds.displayName === 'CPU'
        )?.id,
        supportCasesDataStreamId: pluginDataStreams.find(
            (ds) => ds.displayName === 'All AWS Support Cases'
        )?.id
    };

    const contentJSON = mustache.render(template, templateBindings);

    const body = {
        displayName: `${namePrefix} My dashboard`,
        workspaceId: workspaceId,
        content: JSON.parse(contentJSON)
    };

    const dashboard = await POST('/dashboards', body);
    return dashboard;
}

async function updateDashboard(dashboardId, content) {
    // Rename the first tile and rename the dashboard
    content.contents[0].config.title = 'CPU Utilisation';
    const body = {
        displayName: `${namePrefix} My renamed dashboard`,
        content: content
    };
    await PUT(`/dashboards/${dashboardId}`, body);
}

async function readDashboard(dashboardId) {
    const dashboard = await GET(`/dashboards/${dashboardId}`);
    return {
        id: dashboard.id,
        displayName: dashboard.displayName,
        workspaceId: dashboard.workspaceId,
        content: dashboard.content
    };
}

// ========== API HELPER FUNCTIONS ==========

function getUrl(path) {
    const baseUrl = 'https://api.squaredup.com/api';
    const apiKey = process.argv[2] || process.env.apiKey;
    path = path.startsWith('/') ? path : `/${path}`;
    const apiKeySeperator = path.includes('?') ? '&' : '?'
    return `${baseUrl}${path}${apiKeySeperator}apiKey=${apiKey}`;
}

function catchHandler(method, path, err) {
    console.error(`\n${method} ${path} ERROR\n${err.message}\n`);
    process.exit(1);
}

async function POST(path, body) {
    try {
        const response = await axios.post(getUrl(path), body);
        const id = response.data;
        return id;
    } catch (err) {
        catchHandler('POST', path, err);
    }
}

async function PUT(path, body) {
    try {
        await axios.put(getUrl(path), body);
    } catch (err) {
        catchHandler('PUT', path, err);
    }
}

async function GET(path) {
    try {
        const response = await axios.get(getUrl(path));
        const body = response.data;
        return body;
    } catch (err) {
        catchHandler('GET', path, err);
    }
}

async function DELETE(path) {
    try {
        await axios.delete(getUrl(path));
    } catch (err) {
        catchHandler('DELETE', path, err);
    }
}
