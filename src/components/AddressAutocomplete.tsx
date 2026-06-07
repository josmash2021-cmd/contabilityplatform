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

// CSS for Google Maps autocomplete dropdown to appear above everything
const AUTOCOMPLETE_CSS = `
  .pac-container {
    z-index: 99999 !important;
    border-radius: 8px !important;
    margin-top: 4px !important;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15) !important;
    border: 1px solid #e5e5e5 !important;
    font-family: inherit !important;
  }
  .pac-item {
    padding: 8px 12px !important;
    font-size: 13px !important;
    cursor: pointer !important;
  }
  .pac-item:hover {
    background-color: #f5f5f5 !important;
  }
  .pac-item-query {
    font-size: 13px !important;
    font-weight: 500 !important;
  }
  .pac-matched {
    font-weight: 600 !important;
  }
  .pac-icon {
    margin-right: 8px !important;
  }
`;

export default function AddressAutocomplete({ value, onChange, onPlaceSelected, placeholder, className }: AddressAutocompleteProps) {
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.google?.maps?.places) {
      setLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => setLoaded(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!loaded || !inputRef.current || !window.google?.maps?.places) return;
    
    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ["address"],
      componentRestrictions: { country: "us" },
    });
    
    autocomplete.addListener("place_changed", () => {
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
  }, [loaded]);

  return (
    <>
      <style>{AUTOCOMPLETE_CSS}</style>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className || "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"}
        autoComplete="off"
      />
    </>
  );
}
