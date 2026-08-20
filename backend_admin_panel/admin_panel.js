// Point this to your LOCAL proxy, not the Cloud Run URL
const API_BASE_URL = "http://localhost:8000"; 

// 1. Get All Personnel
async function getPersonnel() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/people`, {
            method: 'GET',
            // Notice: No X-Admin-Key header here! The proxy does it for us.
        });
        
        if (!response.ok) throw new Error(`Error: ${response.status}`);
        
        const data = await response.json();
        console.log("Fetched personnel:", data);
        return data; 
    } catch (error) {
        console.error("Failed to fetch personnel:", error);
    }
}

// 2. Add Personnel (Multipart Form Data)
async function addPerson(formElement) {
    const formData = new FormData(formElement);
    try {
        const response = await fetch(`${API_BASE_URL}/admin/people`, {
            method: 'POST',
            headers: getHeaders(), // Note: Do NOT set Content-Type, browser handles it
            body: formData 
        });
        if (!response.ok) throw new Error(`Error: ${response.status}`);
        console.log("Person added successfully", await response.json());
    } catch (error) {
        console.error("Failed to add person:", error);
    }
}

// 3. Edit Personnel (Multipart Form Data)
async function editPerson(personId, formElement) {
    const formData = new FormData(formElement);
    try {
        const response = await fetch(`${API_BASE_URL}/admin/people/${personId}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: formData
        });
        if (!response.ok) throw new Error(`Error: ${response.status}`);
        console.log("Person updated successfully", await response.json());
    } catch (error) {
        console.error("Failed to update person:", error);
    }
}

// 4. Delete Personnel
async function deletePerson(personId) {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/people/${personId}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        if (!response.ok) throw new Error(`Error: ${response.status}`);
        console.log("Person deleted successfully");
    } catch (error) {
        console.error("Failed to delete person:", error);
    }
}

// 5. Reload Registry
async function reloadRegistry() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/reload`, {
            method: 'POST',
            headers: getHeaders()
        });
        if (!response.ok) throw new Error(`Error: ${response.status}`);
        console.log("Registry reloaded successfully", await response.json());
    } catch (error) {
        console.error("Failed to reload registry:", error);
    }
}