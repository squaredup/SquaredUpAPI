import axios from 'axios';

// Set a workspace name prefix to allow easy cleanup of
// workspaces created by this script at any later time
const workspaceNamePrefix = '[API Test]';

const pluginDataSources = await GET('/source/configs?type=source.plugin');
const workspaces = await GET('/workspaces');

// Create a new workspace
const newWorkspaceId = await createWorkspace();

// Update the workspace
await updateWorkspace(newWorkspaceId);

// Read the workspace 
const newWorkspace = await readWorkspace(newWorkspaceId);
console.log('\n========== WORKSPACE ==========\n');
console.log(JSON.stringify(newWorkspace, null, 2));

async function deleteWorkspaces() {
    const toDelete = (await GET('/workspaces')).filter((workspace) => {
        return workspace.displayName.startsWith(workspaceNamePrefix);
    });
    await Promise.all(toDelete.map((workspace) => {
        return DELETE(`/workspaces/${workspace.id}`);
    }));
    console.log(`\n${workspaceNamePrefix} WORKSPACES DELETED\n`);
}

// Uncomment next line to delete all workspaces ever created by this script
//await deleteWorkspaces();

console.log('\n========== FINISHED ==========\n');

// ========== WORKSPACE FUNCTIONS ==========

async function createWorkspace() {
    const body = {
        displayName: `${workspaceNamePrefix} My workspace`,
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
        displayName: `${workspaceNamePrefix} My renamed workspace`,
        // Specify new acl if you want to change it, otherwise don't
        // and acl will be unchanged
        // Specify acl: null to disable restrictions for this workspace
        acl: null,
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
        links: workspace.data.links,
        properties: workspace.data.properties,
        acl: await GET(`/accesscontrol/acl/${workspaceId}`)
    }
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
    console.error(`${method} ${path} ERROR\n${err.message}\n`);
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
