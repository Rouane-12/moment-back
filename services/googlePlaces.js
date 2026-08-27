const axios = require('axios');

class GooglePlacesService {
  constructor() {
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY;
    this.baseUrl = 'https://maps.googleapis.com/maps/api';
  }

  async searchNearby(location, radius, type) {
    try {
      const response = await axios.get(`${this.baseUrl}/place/nearbysearch/json`, {
        params: {
          key: this.apiKey,
          location: `${location.lat},${location.lng}`,
          radius: radius * 1000,
          type: type
        }
      });
      return response.data;
    } catch (error) {
      console.error('Google Places Nearby Search error:', error);
      throw error;
    }
  }

  async getPlaceDetails(placeId) {
    try {
      const response = await axios.get(`${this.baseUrl}/place/details/json`, {
        params: {
          key: this.apiKey,
          place_id: placeId,
          fields: 'name,place_id,geometry,formatted_address,formatted_phone_number,website,rating,review,types,opening_hours'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Google Places Details error:', error);
      throw error;
    }
  }

  async searchByText(query, location) {
    try {
      const response = await axios.get(`${this.baseUrl}/place/textsearch/json`, {
        params: {
          key: this.apiKey,
          query: query,
          location: location ? `${location.lat},${location.lng}` : undefined,
          radius: location ? 15000 : undefined
        }
      });
      return response.data;
    } catch (error) {
      console.error('Google Places Text Search error:', error);
      throw error;
    }
  }

  mapToVenue(placeData, category) {
    if (!placeData.result) return null;

    const result = placeData.result;
    return {
      name: result.name,
      googlePlaceId: result.place_id,
      address: result.formatted_address,
      phone: result.formatted_phone_number,
      website: result.website,
      latitude: result.geometry?.location?.lat,
      longitude: result.geometry?.location?.lng,
      rating: result.rating || 0,
      reviewCount: result.reviews?.length || 0,
      category: category,
      status: 'imported',
      verificationStatus: 'pending'
    };
  }
}

module.exports = new GooglePlacesService();
