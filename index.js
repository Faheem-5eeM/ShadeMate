const form = document.getElementById('location-form');
        const fromInput = document.getElementById('from-location');
        const toInput = document.getElementById('to-location');
        const fromSuggestions = document.getElementById('from-suggestions');
        const toSuggestions = document.getElementById('to-suggestions');
        const resultContainer = document.getElementById('result-container');
        const resultSide = document.getElementById('result-side');
        const explanationText = document.getElementById('explanation-text');
        const errorMessage = document.getElementById('error-message');
        const sunIcon = document.getElementById('sun-icon');
        const submitButton = document.getElementById('submit-button');
        const buttonText = document.getElementById('button-text');
        const buttonSpinner = document.getElementById('button-spinner');
        const currentTimeEl = document.getElementById('current-time');
        const arrivalTimeEl = document.getElementById('arrival-time');
        const distanceEl = document.getElementById('distance');

        // Store coordinates of selected places
        let fromCoords = null;
        let toCoords = null;

        // --- Event Listeners ---
        form.addEventListener('submit', async function(event) {
            event.preventDefault();
            hideError();
            hideResult();
            await calculateRecommendation();
        });
        
        fromInput.addEventListener('input', debounce(e => handleAutocomplete(e.target, fromSuggestions, 'from')));
        toInput.addEventListener('input', debounce(e => handleAutocomplete(e.target, toSuggestions, 'to')));
        
        document.addEventListener('click', (e) => {
            if (!fromInput.contains(e.target)) fromSuggestions.classList.add('hidden');
            if (!toInput.contains(e.target)) toSuggestions.classList.add('hidden');
        });

        // --- Core Logic ---
        async function calculateRecommendation() {
            setLoading(true);
            const fromCity = fromInput.value;
            const toCity = toInput.value;

            if (!fromCoords || fromInput.dataset.selectedName !== fromCity) fromCoords = await geocodePlace(fromCity);
            if (!toCoords || toInput.dataset.selectedName !== toCity) toCoords = await geocodePlace(toCity);

            if (!fromCoords) { showError(`Could not find location: "${fromCity}". Please select from suggestions.`); setLoading(false); return; }
            if (!toCoords) { showError(`Could not find location: "${toCity}". Please select from suggestions.`); setLoading(false); return; }
            if (fromCity === toCity) { showError("Your 'From' and 'To' locations cannot be the same."); setLoading(false); return; }

            // Get actual road distance and duration from a routing service
            const routeInfo = await getRouteInfo(fromCoords.lat, fromCoords.lon, toCoords.lat, toCoords.lon);
            if (!routeInfo) {
                showError("Could not calculate the travel route. Please try different locations.");
                setLoading(false);
                return;
            }
            
            const distanceKm = routeInfo.distance / 1000;
            const travelMilliseconds = routeInfo.duration * 1000;

            const bearing = getBearing(fromCoords.lat, fromCoords.lon, toCoords.lat, toCoords.lon);
            const currentTime = new Date();
            const currentHour = currentTime.getHours();
            const arrivalTime = new Date(currentTime.getTime() + travelMilliseconds);

            const isMorning = currentHour >= 4 && currentHour < 12; 
            const isAfternoon = currentHour >= 12 && currentHour < 19;
            let side, explanation;

            if (!isMorning && !isAfternoon) {
                 side = "Either";
                 explanation = `It's currently dark outside, so you can sit on any side you prefer!`;
            } else if ((bearing > 315 || bearing <= 45) || (bearing > 135 && bearing <= 225)) {
                const isHeadingNorth = (bearing > 315 || bearing <= 45);
                side = isMorning ? (isHeadingNorth ? "Left" : "Right") : (isHeadingNorth ? "Right" : "Left");
                explanation = `You're heading generally ${isHeadingNorth ? 'North' : 'South'}. In the ${isMorning ? 'morning' : 'afternoon'}, the sun is in the ${isMorning ? 'east' : 'west'}, so the ${side.toLowerCase()} side will be shadier.`;
            } else {
                const isHeadingEast = bearing > 45 && bearing <= 135;
                if(isMorning) {
                    side = isHeadingEast ? "Either" : "Both";
                    explanation = isHeadingEast ? "The sun will be mostly behind you. Both sides should be comfortable." : "The sun will be mostly in front of you. Both sides will get some light.";
                } else {
                    side = isHeadingEast ? "Both" : "Either";
                    explanation = isHeadingEast ? "The sun will be mostly in front of you. Both sides will get some light." : "The sun will be mostly behind you. Both sides should be comfortable.";
                }
            }

            displayResult(side, explanation, currentTime, arrivalTime, distanceKm);
            setLoading(false);
        }
        
        async function getRouteInfo(lat1, lon1, lat2, lon2) {
            // Using the OSRM API for routing
            const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    console.error(`Routing API error: ${response.statusText}`);
                    return null;
                }
                const data = await response.json();
                if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                    const route = data.routes[0];
                    return {
                        distance: route.distance, // in meters
                        duration: route.duration  // in seconds
                    };
                }
                return null;
            } catch (error) {
                console.error("Failed to fetch route info:", error);
                return null;
            }
        }

        async function geocodePlace(placeName) {
            if (!placeName) return null;
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(placeName)}&countrycodes=in&limit=1&accept-language=en`;
            try {
                const response = await fetch(url, { headers: { 'User-Agent': 'SunShieldApp/1.0 (for a web project)' } });
                const data = await response.json();
                if (data && data.length > 0) return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
                return null;
            } catch (error) { console.error("Geocoding error:", error); return null; }
        }

        function getBearing(lat1, lon1, lat2, lon2) {
            const toRadians = (deg) => deg * Math.PI / 180;
            const y = Math.sin(toRadians(lon2 - lon1)) * Math.cos(toRadians(lat2));
            const x = Math.cos(toRadians(lat1)) * Math.sin(toRadians(lat2)) - Math.sin(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.cos(toRadians(lon2 - lon1));
            const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
            return bearing;
        }

        // --- Autocomplete ---
        async function handleAutocomplete(inputElement, suggestionsContainer, type) {
            const query = inputElement.value;
            if (query.length < 3) { suggestionsContainer.innerHTML = ''; suggestionsContainer.classList.add('hidden'); return; }
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=in&limit=5&accept-language=en`;
            try {
                const response = await fetch(url, { headers: { 'User-Agent': 'SunShieldApp/1.0 (for a web project)' } });
                const suggestions = await response.json();
                displaySuggestions(suggestions, inputElement, suggestionsContainer, type);
            } catch (error) { console.error("Autocomplete fetch error:", error); }
        }

        function displaySuggestions(suggestions, inputElement, suggestionsContainer, type) {
            suggestionsContainer.innerHTML = '';
            if (suggestions.length === 0) { suggestionsContainer.classList.add('hidden'); return; }
            suggestions.forEach(suggestion => {
                const item = document.createElement('div');
                item.className = 'suggestion-item';
                item.textContent = suggestion.display_name;
                item.addEventListener('click', () => {
                    inputElement.value = suggestion.display_name;
                    inputElement.dataset.selectedName = suggestion.display_name;
                    if (type === 'from') fromCoords = { lat: parseFloat(suggestion.lat), lon: parseFloat(suggestion.lon) };
                    else toCoords = { lat: parseFloat(suggestion.lat), lon: parseFloat(suggestion.lon) };
                    suggestionsContainer.innerHTML = '';
                    suggestionsContainer.classList.add('hidden');
                });
                suggestionsContainer.appendChild(item);
            });
            suggestionsContainer.classList.remove('hidden');
        }

        function debounce(func, delay = 350) {
            let timeoutId;
            return (...args) => { clearTimeout(timeoutId); timeoutId = setTimeout(() => { func.apply(this, args); }, delay); };
        }

        // --- UI Functions ---
        function setLoading(isLoading) {
            submitButton.disabled = isLoading;
            buttonText.classList.toggle('hidden', isLoading);
            buttonSpinner.classList.toggle('hidden', !isLoading);
        }
        
        function displayResult(side, explanation, currentTime, arrivalTime, distance) {
            resultSide.textContent = side;
            explanationText.textContent = explanation;
            
            const timeFormatOptions = { hour: '2-digit', minute: '2-digit' };
            const dateFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
            
            currentTimeEl.textContent = `${currentTime.toLocaleDateString('en-IN', dateFormatOptions)}, ${currentTime.toLocaleTimeString('en-IN', timeFormatOptions)}`;
            arrivalTimeEl.textContent = `${arrivalTime.toLocaleDateString('en-IN', dateFormatOptions)}, ${arrivalTime.toLocaleTimeString('en-IN', timeFormatOptions)}`;
            distanceEl.textContent = distance.toFixed(1);

            sunIcon.style.left = side === 'Left' ? 'auto' : '-2rem';
            sunIcon.style.right = side === 'Left' ? '-2rem' : 'auto';
            sunIcon.style.opacity = (side === 'Either' || side === 'Both') ? '0' : '1';
            resultContainer.classList.remove('opacity-0', 'scale-95', '-translate-y-4');
        }

        function hideResult() { resultContainer.classList.add('opacity-0', 'scale-95', '-translate-y-4'); }
        function showError(message) { errorMessage.textContent = message; errorMessage.classList.remove('hidden'); }
        function hideError() { errorMessage.classList.add('hidden'); }