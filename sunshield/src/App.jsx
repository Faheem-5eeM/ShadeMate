import './App.css';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import SplashCursor from './components/SplashCursor.jsx';
import { useIsDesktop } from './hooks/useIsDesktop'; // ✅ 1. IMPORT THE NEW HOOK

// Helper component for the loading spinner
const Spinner = () => (
    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

// Helper component for the Sun icon
const SunIcon = () => (
     <svg className="w-10 h-10 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 14.95a1 1 0 001.414 1.414l.707-.707a1 1 0 00-1.414-1.414l-.707.707zm-2.12-10.607a1 1 0 011.414 0l.707.707a1 1 0 11-1.414 1.414l-.707-.707a1 1 0 010-1.414zM4 11a1 1 0 100-2H3a1 1 0 100 2h1z" clipRule="evenodd"></path>
    </svg>
);

const App = () => {
    const isDesktop = useIsDesktop(); // ✅ 2. CALL THE HOOK TO CHECK SCREEN SIZE

    // --- State Management ---
    const [fromLocation, setFromLocation] = useState('');
    const [toLocation, setToLocation] = useState('');
    const [fromSuggestions, setFromSuggestions] = useState([]);
    const [toSuggestions, setToSuggestions] = useState([]);
    const [fromCoords, setFromCoords] = useState(null);
    const [toCoords, setToCoords] = useState(null);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    const fromRef = useRef(null);
    const toRef = useRef(null);
    
    // --- API & Calculation Logic ---

    const geocodePlace = async (placeName) => {
        if (!placeName) return null;
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(placeName)}&countrycodes=in&limit=1&accept-language=en`;
        try {
            const response = await fetch(url, { headers: { 'User-Agent': 'SunShieldApp/1.0 (for a web project)' } });
            const data = await response.json();
            if (data && data.length > 0) return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
            return null;
        } catch (error) { console.error("Geocoding error:", error); return null; }
    };

    const getRouteInfo = async (lat1, lon1, lat2, lon2) => {
        const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
        try {
            const response = await fetch(url);
            if (!response.ok) { console.error(`Routing API error: ${response.statusText}`); return null; }
            const data = await response.json();
            if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                return { distance: route.distance, duration: route.duration };
            }
            return null;
        } catch (error) { console.error("Failed to fetch route info:", error); return null; }
    };

    const getBearing = (lat1, lon1, lat2, lon2) => {
        const toRadians = (deg) => deg * Math.PI / 180;
        const y = Math.sin(toRadians(lon2 - lon1)) * Math.cos(toRadians(lat2));
        const x = Math.cos(toRadians(lat1)) * Math.sin(toRadians(lat2)) - Math.sin(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.cos(toRadians(lon2 - lon1));
        const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
        return bearing;
    };

    const debounce = (func, delay = 350) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    };

    const handleAutocomplete = async (query, setSuggestions) => {
        if (query.length < 3) { setSuggestions([]); return; }
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=in&limit=5&accept-language=en`;
        try {
            const response = await fetch(url, { headers: { 'User-Agent': 'SunShieldApp/1.0 (for a web project)' } });
            const suggestions = await response.json();
            setSuggestions(suggestions);
        } catch (error) { console.error("Autocomplete fetch error:", error); }
    };
    
    const debouncedAutocomplete = useCallback(debounce(handleAutocomplete, 350), []);

    // --- Event Handlers ---

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setResult(null);
        setIsLoading(true);

        let finalFromCoords = fromCoords;
        let finalToCoords = toCoords;
        
        if (!finalFromCoords) finalFromCoords = await geocodePlace(fromLocation);
        if (!finalToCoords) finalToCoords = await geocodePlace(toLocation);

        if (!finalFromCoords) { 
            setError(`Could not find location: "${fromLocation}". Please select from suggestions.`); 
            setIsLoading(false); 
            return; 
        }
        if (!finalToCoords) { 
            setError(`Could not find location: "${toLocation}". Please select from suggestions.`); 
            setIsLoading(false); 
            return; 
        }
        if (fromLocation === toLocation) { 
            setError("Your 'From' and 'To' locations cannot be the same."); 
            setIsLoading(false); 
            return; 
        }

        const routeInfo = await getRouteInfo(
            finalFromCoords.lat, finalFromCoords.lon, 
            finalToCoords.lat, finalToCoords.lon
        );
        if (!routeInfo) { 
            setError("Could not calculate the travel route. Please try different locations."); 
            setIsLoading(false); 
            return; 
        }
        
        const distanceKm = routeInfo.distance / 1000;
        const travelMilliseconds = routeInfo.duration * 1000;
        const bearing = getBearing(
            finalFromCoords.lat, finalFromCoords.lon, 
            finalToCoords.lat, finalToCoords.lon
        );

        const currentTime = new Date();
        const currentHour = currentTime.getHours();
        const arrivalTime = new Date(currentTime.getTime() + travelMilliseconds);

        const isMorning = currentHour >= 4 && currentHour < 12;
        const isAfternoon = currentHour >= 12 && currentHour < 19;
        const isNight = !isMorning && !isAfternoon;

        let side, explanation;

        if (isNight) {
            side = "Either";
            explanation = "It's currently night time, so you can sit anywhere comfortably!";
        } 
        else if ((bearing > 315 || bearing <= 45) || (bearing > 135 && bearing <= 225)) {
            // North-South direction
            const isHeadingNorth = (bearing > 315 || bearing <= 45);
            side = isMorning 
                ? (isHeadingNorth ? "Left" : "Right") 
                : (isHeadingNorth ? "Right" : "Left");
            
            explanation = `You're heading generally ${isHeadingNorth ? 'North' : 'South'}. In the ${isMorning ? 'morning' : 'afternoon'}, the sun is in the ${isMorning ? 'east' : 'west'}, so the ${side.toLowerCase()} side will be shadier.`;
        } 
        else {
            // East-West direction
            const isHeadingEast = bearing > 45 && bearing <= 135;
            if (isMorning) {
                side = isHeadingEast ? "Either" : "Both";
                explanation = isHeadingEast 
                    ? "The sun will be mostly behind you. Both sides should be comfortable." 
                    : "The sun will be mostly in front of you. Both sides will get some light.";
            } else {
                side = isHeadingEast ? "Both" : "Either";
                explanation = isHeadingEast 
                    ? "The sun will be mostly in front of you. Both sides will get some light." 
                    : "The sun will be mostly behind you. Both sides should be comfortable.";
            }
        }

        setResult({ side, explanation, currentTime, arrivalTime, distance: distanceKm });
        setIsLoading(false);
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (fromRef.current && !fromRef.current.contains(event.target)) {
                setFromSuggestions([]);
            }
            if (toRef.current && !toRef.current.contains(event.target)) {
                setToSuggestions([]);
            }
        };
        document.addEventListener('click', handleClickOutside);
        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    }, []);

    const formatTime = (date) => {
        const timeFormatOptions = { hour: '2-digit', minute: '2-digit' };
        const dateFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
        return `${date.toLocaleDateString('en-IN', dateFormatOptions)}, ${date.toLocaleTimeString('en-IN', timeFormatOptions)}`;
    };

    return (
        <div className="bg-slate-100 flex items-center justify-center min-h-screen">
            <div className="w-full max-w-md mx-auto p-6 md:p-8">
                <div className="bg-white rounded-2xl shadow-lg p-8">
                    <div className="text-center">
                        <h1 className="text-3xl font-bold text-slate-800">Shade Mate</h1>
                        <p className="text-slate-500 mt-2">Find the best bus seat to avoid sunlight anywhere in India.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                        <div className="relative" ref={fromRef}>
                            <label htmlFor="from-location" className="text-sm font-medium text-slate-700">From</label>
                            <input
                                type="text"
                                id="from-location"
                                className="mt-1 block w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                placeholder="e.g., Pumpwell, Mangalore"
                                required
                                autoComplete="off"
                                value={fromLocation}
                                onChange={(e) => {
                                    setFromLocation(e.target.value);
                                    setFromCoords(null);
                                    debouncedAutocomplete(e.target.value, setFromSuggestions);
                                }}
                            />
                            {fromSuggestions.length > 0 && (
                                <div className="suggestions-container">
                                    {fromSuggestions.map((s) => (
                                        <div
                                            key={s.place_id}
                                            className="suggestion-item"
                                            onClick={() => {
                                                setFromLocation(s.display_name);
                                                setFromCoords({ lat: parseFloat(s.lat), lon: parseFloat(s.lon) });
                                                setFromSuggestions([]);
                                            }}
                                        >
                                            {s.display_name}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                         <div className="relative" ref={toRef}>
                            <label htmlFor="to-location" className="text-sm font-medium text-slate-700">To</label>
                            <input
                                type="text"
                                id="to-location"
                                className="mt-1 block w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                placeholder="e.g., Deralakatte"
                                required
                                autoComplete="off"
                                value={toLocation}
                                onChange={(e) => {
                                    setToLocation(e.target.value);
                                    setToCoords(null);
                                    debouncedAutocomplete(e.target.value, setToSuggestions);
                                }}
                            />
                            {toSuggestions.length > 0 && (
                                <div className="suggestions-container">
                                    {toSuggestions.map((s) => (
                                        <div
                                            key={s.place_id}
                                            className="suggestion-item"
                                            onClick={() => {
                                                setToLocation(s.display_name);
                                                setToCoords({ lat: parseFloat(s.lat), lon: parseFloat(s.lon) });
                                                setToSuggestions([]);
                                            }}
                                        >
                                            {s.display_name}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button type="submit" disabled={isLoading} className="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-transform transform hover:scale-105 shadow-md flex items-center justify-center">
                            {isLoading ? <Spinner /> : <span>Find My Seat</span>}
                        </button>
                    </form>
                    
                    {result && (
                        <div id="result-container" className="mt-8 text-center transition-all duration-500">
                            <div className="relative inline-flex items-center justify-center w-32 h-32 my-4">
                              <div
                                className="absolute transition-all duration-500 ease-in-out z-10"
                                style={{
                                  left: result.side === 'Left' ? 'auto' : '-2.5rem',
                                  right: result.side === 'Left' ? '-2.5rem' : 'auto',
                                  opacity: (result.side === 'Either' || result.side === 'Both') ? 0 : 1,
                                }}
                              >
                                <SunIcon />
                              </div>
                              <img
                                src="seat.png"
                                alt="Recommended Seat"
                                className={`w-24 h-24 transition-transform duration-500 ${result.side === 'Right' ? 'flipped' : ''}`}
                                style={{
                                  opacity: (result.side === 'Left' || result.side === 'Right') ? 1 : 0.3,
                                }}
                              />
                            </div>
                            <h2 className="text-2xl font-bold text-indigo-600">
                              Sit on the <span id="result-side">{result.side}</span> Side
                            </h2>
                            <p className="text-slate-600 mt-2">{result.explanation}</p>
                            <div className="text-sm text-slate-500 mt-4 space-y-1 border-t pt-4">
                              <p>
                                Current Time:{" "}
                                <span className="font-medium text-slate-700">
                                  {formatTime(result.currentTime)}
                                </span>
                              </p>
                              <p>
                                Est. Arrival:{" "}
                                <span className="font-medium text-slate-700">
                                  {formatTime(result.arrivalTime)}
                                </span>{" "}
                                (~<span id="distance">{result.distance.toFixed(1)}</span> km)
                              </p>
                            </div>
                        </div>
                    )}
                    
                    {error && <div className="mt-4 text-center text-red-600 font-medium">{error}</div>}

                    <p className="text-xs text-slate-400 text-center mt-8">
                        © 2025 Shade Mate. All rights reserved.
                    </p>
                </div>
            </div>
            {/* ✅ 3. CONDITIONALLY RENDER BASED ON SCREEN SIZE */}
            {isDesktop && <SplashCursor />}
        </div>
    );
};

export default App;