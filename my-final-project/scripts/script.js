const UIElements = {
    map: null,
    statusMessage: document.getElementById('status-message'),
    pharmacyDetailsCard: document.getElementById('pharmacy-details'),
    pharmacyName: document.getElementById('pharmacy-name'),
    pharmacyAddress: document.getElementById('pharmacy-address'),
    pharmacyHours: document.getElementById('pharmacy-hours'),
    directionsButton: document.getElementById('directions-btn'),
    closeDetailsButton: document.getElementById('close-details-btn'),
    lastUpdatedSpan: document.getElementById('last-updated'),
    currentYearSpan: document.getElementById('currentyear'),
    visitedSection: document.getElementById('visited-pharmacies-section'),
    visitedList: document.getElementById('visited-list'),
};


const API_URL = 'https://midas.minsal.cl/farmacia_v2/WS/getLocales.php';
const MAX_DISTANCE_KM = 30;
let userLocation = null;
let currentPharmacy = null;


function initMap() {
    const initialCoords = [-33.45694, -70.64827]; // Santiago
    UIElements.map = L.map('map').setView(initialCoords, 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(UIElements.map);
}

function displayPharmaciesOnMap(pharmacies) {
    UIElements.map.eachLayer(layer => {
        if (layer instanceof L.Marker) UIElements.map.removeLayer(layer);
    });
    if (userLocation) {
        const popupText = userLocation.isFromStorage ? 'Your Last Saved Location' : 'Your Current Location';
        L.marker([userLocation.lat, userLocation.lng]).addTo(UIElements.map).bindPopup(popupText).openPopup();
    }
    if (pharmacies.length === 0) {
        UIElements.statusMessage.textContent = userLocation ? `No open pharmacies found within ${MAX_DISTANCE_KM} km.` : 'No open pharmacies found.';
        return;
    }
    UIElements.statusMessage.textContent = `Found ${pharmacies.length} open pharmacies` + (userLocation ? ` within ${MAX_DISTANCE_KM} km.` : ' across the country.');
    const pharmacyIcon = L.icon({ iconUrl: 'images/pharmacy-pin.png', iconSize: [40, 40], iconAnchor: [20, 40] });
    pharmacies.forEach(pharmacy => {
        const lat = parseFloat(pharmacy.local_lat);
        const lng = parseFloat(pharmacy.local_lng);
        if (!isNaN(lat) && !isNaN(lng)) {
            const marker = L.marker([lat, lng], { icon: pharmacyIcon }).addTo(UIElements.map);
            marker.on('click', () => showPharmacyDetails(pharmacy));
        }
    });
}


const storage = {
    save: (key, value) => localStorage.setItem(key, JSON.stringify(value)),
    get: (key) => JSON.parse(localStorage.getItem(key) || 'null'),
};

function saveVisitedPharmacy(pharmacy) {
    let visited = storage.get('visitedPharmacies') || [];
    if (!visited.some(p => p.local_id === pharmacy.local_id)) {
        
        const pharmacyInfo = {
            local_id: pharmacy.local_id,
            local_nombre: pharmacy.local_nombre,
            local_direccion: pharmacy.local_direccion,
            comuna_nombre: pharmacy.comuna_nombre,
            local_lat: pharmacy.local_lat,
            local_lng: pharmacy.local_lng
        };
        visited.unshift(pharmacyInfo);
        if (visited.length > 5) visited.pop();
        storage.save('visitedPharmacies', visited);
        displayVisitedPharmacies();
    }
}

function getUserLocation() {
    return new Promise(resolve => {
        const handleSuccess = (position) => {
            userLocation = { lat: position.coords.latitude, lng: position.coords.longitude, isFromStorage: false };
            storage.save('userLocation', { lat: userLocation.lat, lng: userLocation.lng });
            UIElements.map.setView([userLocation.lat, userLocation.lng], 14);
            resolve(userLocation);
        };
        const handleError = () => {
            const savedLocation = storage.get('userLocation');
            if (savedLocation) {
                userLocation = { ...savedLocation, isFromStorage: true };
                UIElements.statusMessage.textContent = 'Using your last saved location.';
                UIElements.map.setView([userLocation.lat, userLocation.lng], 14);
                resolve(userLocation);
            } else {
                UIElements.statusMessage.textContent = 'Could not get your location. Showing all open pharmacies.';
                resolve(null);
            }
        };
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(handleSuccess, handleError);
        } else {
            handleError();
        }
    });
}

async function fetchPharmacyData() {
    UIElements.statusMessage.textContent = 'Fetching pharmacy data...';
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const textData = await response.text();
        return JSON.parse(textData);
    } catch (error) {
        console.error('Error fetching pharmacy data:', error);
        UIElements.statusMessage.innerHTML = '<strong>Error:</strong> Could not fetch pharmacy data. The official API might be down, The API does not work outside of Chile...';
        return null;
    }
}


function isPharmacyOpen(pharmacy) {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const [openHour, openMinute] = pharmacy.funcionamiento_hora_apertura.split(':').map(Number);
    const [closeHour, closeMinute] = pharmacy.funcionamiento_hora_cierre.split(':').map(Number);
    const openTime = openHour * 60 + openMinute;
    let closeTime = closeHour * 60 + closeMinute;
    if (closeTime < openTime) {
        return currentTime >= openTime || currentTime < closeTime;
    }
    return currentTime >= openTime && currentTime < closeTime;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 0.5 - Math.cos(dLat) / 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * (1 - Math.cos(dLon)) / 2;
    return R * 2 * Math.asin(Math.sqrt(a));
}


function displayVisitedPharmacies() {
    const visited = storage.get('visitedPharmacies') || [];
    if (visited.length > 0) {
        UIElements.visitedSection.style.display = 'block';
      
        UIElements.visitedList.innerHTML = visited.map(p => {
            const destination = `${p.local_lat},${p.local_lng}`;
            const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
            return `
                <div class="visited-card">
                    <div>
                        <h3>${p.local_nombre}</h3>
                        <p>${p.local_direccion}, ${p.comuna_nombre}</p>
                    </div>
                    <a href="${mapsUrl}" class="button-primary" target="_blank" rel="noopener">Get Directions</a>
                </div>
            `;
        }).join('');
    } else {
        UIElements.visitedSection.style.display = 'none';
    }
}

function showPharmacyDetails(pharmacy) {
    currentPharmacy = pharmacy;
    UIElements.pharmacyName.textContent = pharmacy.local_nombre;
    UIElements.pharmacyAddress.textContent = `${pharmacy.local_direccion}, ${pharmacy.comuna_nombre}`;
    UIElements.pharmacyHours.textContent = `Hours: ${pharmacy.funcionamiento_hora_apertura} to ${pharmacy.funcionamiento_hora_cierre}`;
    const destination = `${pharmacy.local_lat},${pharmacy.local_lng}`;
    UIElements.directionsButton.href = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
    UIElements.pharmacyDetailsCard.classList.add('is-visible');
}

function hidePharmacyDetails() {
    UIElements.pharmacyDetailsCard.classList.remove('is-visible');
}

function updateFooter() {
    const now = new Date();
    UIElements.currentYearSpan.textContent = now.getFullYear();
    UIElements.lastUpdatedSpan.textContent = now.toLocaleTimeString('en-US');
}


async function main() {
    initMap();
    updateFooter();
    displayVisitedPharmacies();

    UIElements.closeDetailsButton.addEventListener('click', hidePharmacyDetails);
    UIElements.directionsButton.addEventListener('click', () => {
        if (currentPharmacy) {
            saveVisitedPharmacy(currentPharmacy);
        }
    });

    const [location, allPharmacies] = await Promise.all([getUserLocation(), fetchPharmacyData()]);
    if (!allPharmacies) return;

    const openPharmacies = allPharmacies.filter(isPharmacyOpen);
    let pharmaciesToDisplay = openPharmacies;

    if (location) {
        pharmaciesToDisplay = openPharmacies.filter(pharmacy => {
            const lat = parseFloat(pharmacy.local_lat);
            const lng = parseFloat(pharmacy.local_lng);
            if (isNaN(lat) || isNaN(lng)) return false;
            const distance = calculateDistance(location.lat, location.lng, lat, lng);
            return distance <= MAX_DISTANCE_KM;
        });
    }

    displayPharmaciesOnMap(pharmaciesToDisplay);
}

document.addEventListener('DOMContentLoaded', main);
