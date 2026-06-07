import { useEffect, useRef, useState, forwardRef } from "react";
import { Input } from "@/components/ui/input";

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

const AddressAutocomplete = forwardRef<HTMLInputElement, AddressAutocompleteProps>(
  ({ value, onChange, onPlaceSelected, placeholder, className }, ref) => {
    const [autocompleteLoaded, setAutocompleteLoaded] = useState(false);
    const localRef = useRef<HTMLInputElement>(null);
    const inputRef = (ref as React.RefObject<HTMLInputElement>) || localRef;

    useEffect(() => {
      if (window.google?.maps?.places) {
        setAutocompleteLoaded(true);
        return;
      }
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
      script.async = true;
      script.onload = () => setAutocompleteLoaded(true);
      document.head.appendChild(script);
    }, []);

    useEffect(() => {
      if (!autocompleteLoaded || !inputRef.current || !window.google?.maps?.places) return;
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
    }, [autocompleteLoaded]);

    return (
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
      />
    );
  }
);

AddressAutocomplete.displayName = "AddressAutocomplete";
export default AddressAutocomplete;
