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
};

const API_URL = 'https://midas.minsal.cl/farmacia_v2/WS/getLocales.php';
const MAX_DISTANCE_KM = 30; 
let userLocation = null; 


function initMap() {
    const initialCoords = [-33.45694, -70.64827]; 
    UIElements.map = L.map('map').setView(initialCoords, 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(UIElements.map);
    console.log('Mapa inicializado.');
}

function displayPharmaciesOnMap(pharmacies) {
    if (!UIElements.map) return;
    
    
    UIElements.map.eachLayer(layer => {
        if (layer instanceof L.Marker) {
            UIElements.map.removeLayer(layer);
        }
    });

   
    if (userLocation) {
         L.marker([userLocation.lat, userLocation.lng]).addTo(UIElements.map)
            .bindPopup('Your Location')
            .openPopup();
    }
    
    if (pharmacies.length === 0) {
        let message = 'No on-duty pharmacies found open right now.';
        if(userLocation) {
            message += ` within ${MAX_DISTANCE_KM} km.`;
        }
        UIElements.statusMessage.textContent = message;
        return;
    }

    let message = `Found ${pharmacies.length} open pharmacies`;
    if(userLocation) {
       message += ` within ${MAX_DISTANCE_KM} km.`;
    } else {
       message += ` across the country.`;
    }
    UIElements.statusMessage.textContent = message;

    const pharmacyIcon = L.icon({
        iconUrl: 'images/pharmacy-pin.png',
        iconSize: [40, 40],
        iconAnchor: [20, 40],
    });

    pharmacies.forEach(pharmacy => {
        const lat = parseFloat(pharmacy.local_lat);
        const lng = parseFloat(pharmacy.local_lng);
        if (!isNaN(lat) && !isNaN(lng)) {
            const marker = L.marker([lat, lng], { icon: pharmacyIcon }).addTo(UIElements.map);
            marker.on('click', () => {
                showPharmacyDetails(pharmacy);
            });
        }
    });
}




function getUserLocation() {
    return new Promise((resolve) => {
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    console.log(`Ubicación del usuario: ${userLocation.lat}, ${userLocation.lng}`);
                    UIElements.map.setView([userLocation.lat, userLocation.lng], 14);
                    resolve(userLocation);
                },
                (error) => {
                    console.warn(`Error al obtener la ubicación: ${error.message}`);
                    UIElements.statusMessage.textContent = 'Could not get your location. Showing all open pharmacies in the country.';
                    resolve(null); 
                }
            );
        } else {
            console.warn('La geolocalización no está disponible.');
            UIElements.statusMessage.textContent = 'Geolocation is not available. Showing all open pharmacies in the country.';
            resolve(null); 
        }
    });
}

async function fetchPharmacyData() {
    UIElements.statusMessage.textContent = 'Fetching pharmacy data...';
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const textData = await response.text();
        const jsonData = JSON.parse(textData);
        console.log('Datos de farmacias recibidos:', jsonData);
        return Array.isArray(jsonData) ? jsonData : [];
    } catch (error) {
        console.error('Error fetching pharmacy data:', error);
        UIElements.statusMessage.innerHTML = `<strong>Error:</strong> Could not fetch pharmacy data. The official API might be down, The API does not work outside of Chile..`;
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
    } else {
       
        return currentTime >= openTime && currentTime < closeTime;
    }
}



function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        0.5 - Math.cos(dLat) / 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        (1 - Math.cos(dLon)) / 2;
    return R * 2 * Math.asin(Math.sqrt(a));
}



function showPharmacyDetails(pharmacy) {
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
    if (UIElements.currentYearSpan) UIElements.currentYearSpan.textContent = now.getFullYear();
    if (UIElements.lastUpdatedSpan) UIElements.lastUpdatedSpan.textContent = now.toLocaleTimeString('en-US');
}



async function main() {
    console.log('Aplicación iniciada.');
    
    initMap();
    updateFooter();

   
    const [_, allPharmacies] = await Promise.all([
        getUserLocation(),
        fetchPharmacyData()
    ]);

    if (!allPharmacies) {
      
        return;
    }

 
    const openPharmacies = allPharmacies.filter(isPharmacyOpen);

    let pharmaciesToDisplay = openPharmacies;

   
    if (userLocation) {
        pharmaciesToDisplay = openPharmacies.filter(pharmacy => {
            const lat = parseFloat(pharmacy.local_lat);
            const lng = parseFloat(pharmacy.local_lng);
            if(isNaN(lat) || isNaN(lng)) return false;

            const distance = calculateDistance(userLocation.lat, userLocation.lng, lat, lng);
            return distance <= MAX_DISTANCE_KM;
        });
    }
    
   
    displayPharmaciesOnMap(pharmaciesToDisplay);
    
    
    if (UIElements.closeDetailsButton) {
        UIElements.closeDetailsButton.addEventListener('click', hidePharmacyDetails);
    }
}

document.addEventListener('DOMContentLoaded', main);
