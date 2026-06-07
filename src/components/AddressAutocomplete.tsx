import { useEffect, useRef, useState } from "react";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyDs8MIOA8qk0JwxOkxd8rGxtAmVTeB7CF0";

declare global {
  interface Window {
    google: any;
  }
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelected?: (place: { address: string; city: string; state: string; zipCode: string }) => void;
  placeholder?: string;
  className?: string;
}

export default function AddressAutocomplete({ value, onChange, onPlaceSelected, placeholder, className }: AddressAutocompleteProps) {
  const [autocompleteLoaded, setAutocompleteLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load Google Maps script
  useEffect(() => {
    if (window.google?.maps?.places) {
      setAutocompleteLoaded(true);
      return;
    }
    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existing) {
      existing.addEventListener("load", () => setAutocompleteLoaded(true));
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => setAutocompleteLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Attach autocomplete to input
  useEffect(() => {
    if (!autocompleteLoaded || !inputRef.current || !window.google?.maps?.places) return;
    
    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ["address"],
      componentRestrictions: { country: "us" },
    });
    
    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place.address_components) return;
      let street = "", cityVal = "", stateVal = "", zipVal = "";
      place.address_components.forEach((comp: any) => {
        const t = comp.types[0];
        if (t === "street_number") street = comp.long_name + " ";
        if (t === "route") street += comp.long_name;
        if (t === "locality") cityVal = comp.long_name;
        if (t === "administrative_area_level_1") stateVal = comp.short_name;
        if (t === "postal_code") zipVal = comp.long_name;
      });
      const fullAddress = street || place.formatted_address || "";
      onChange(fullAddress);
      if (onPlaceSelected) {
        onPlaceSelected({ address: fullAddress, city: cityVal, state: stateVal, zipCode: zipVal });
      }
    });
    
    return () => {
      if (listener && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(autocomplete);
      }
    };
  }, [autocompleteLoaded, onChange, onPlaceSelected]);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className || "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"}
    />
  );
}
